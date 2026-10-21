import { centralDb } from './db';
import { webPushService } from './webPushService';
import {
  Notification,
  NotificationDelivery,
  DeliveryChannel,
  DeliveryStatus,
  UserNotificationDevice,
} from '../src/types';
import { deedReminderId, deedVerificationReminderId, computeDeedTransferEligibility } from '../src/lib/deedTransfer';

/** One calendar day in ms — reminder scheduling is day-granular, not hour-granular. */
const DAY_MS = 24 * 60 * 60 * 1000;

class NotificationScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private notifiedTaskKeys = new Set<string>();
  private isProcessing = false;

  /** Quiet hours are stored as "HH:MM" strings and may wrap past midnight. */
  private isWithinQuietHours(start?: string, end?: string): boolean {
    if (!start || !end) return false;
    const parse = (v: string) => {
      const [h, m] = v.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const s = parse(start);
    const e = parse(end);
    if (s === e) return false;
    return s < e ? nowMin >= s && nowMin < e : nowMin >= s || nowMin < e;
  }

  public start(intervalMs = 15000) {
    if (this.intervalId) return;
    console.log(`[NotificationScheduler] Starting background reminder scheduler (Interval: ${intervalMs}ms)...`);

    // Initial run
    this.checkReminders().catch((err) => console.error('[NotificationScheduler] Initial check error:', err));

    this.intervalId = setInterval(() => {
      this.checkReminders().catch((err) => console.error('[NotificationScheduler] Periodic check error:', err));
    }, intervalMs);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[NotificationScheduler] Stopped background reminder scheduler.');
    }
  }

  public async checkReminders() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const db = centralDb.getDatabase();
      const now = Date.now();

      // ----------------------------------------------------
      // 1. Task Reminders & Due Dates
      // ----------------------------------------------------
      const activeTasks = (db.tasks || []).filter(
        (t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
      );

      for (const task of activeTasks) {
        const reminderTarget = task.reminderDate || task.dueDate;
        if (!reminderTarget) continue;

        const targetTime = new Date(reminderTarget).getTime();
        if (isNaN(targetTime) || targetTime > now) continue;

        const taskKey = `task-${task.id}-${reminderTarget}`;
        if (this.notifiedTaskKeys.has(taskKey)) continue;

        // Check if DB already has a reminder notification for this task to avoid duplicates across restarts
        const existingNotif = (db.notifications || []).find(
          (n) => n.relatedEntityType === 'TASK' && n.relatedEntityId === task.id
        );

        if (existingNotif) {
          this.notifiedTaskKeys.add(taskKey);
          continue;
        }

        this.notifiedTaskKeys.add(taskKey);

        const targetUserId = task.assignedUserId || task.creatorUserId || 'usr-admin';
        const notifTitle = `یادآور وظیفه: ${task.title}`;
        const notifBody = `موعد انجام این وظیفه فرا رسیده است.${
          task.customerName ? ` (مشتری: ${task.customerName})` : ''
        }`;

        const notif: Notification = {
          id: `notif-task-${task.id}-${Date.now()}`,
          userId: targetUserId,
          title: notifTitle,
          message: notifBody,
          body: notifBody,
          category: 'TASK',
          priority: String(task.priority || 'HIGH').toUpperCase(),
          read: false,
          relatedEntityType: 'TASK',
          relatedEntityId: task.id,
          relatedCustomerName: task.customerName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const savedNotif = await centralDb.saveNotification(notif);
        console.log(`[NotificationScheduler] Generated due reminder for task "${task.title}" (User: ${targetUserId})`);

        await this.dispatchToUser(targetUserId, savedNotif);
      }

      // ----------------------------------------------------
      // 2. SIM Ownership-Transfer Reminders
      //
      // Reminders follow the operator's MANUAL due date (`deedTransferDueDate`),
      // which is the date they chose for follow-up. The calculated eligibility
      // date is deliberately NOT used here: it is advisory, and a SIM may well
      // be followed up on a date the operator picked independently of it.
      //
      // Three occurrences: one the day before the due date, one on the day, and
      // a single overdue follow-up for a SIM whose date had already passed when
      // it was entered (a reminder scheduled in the past would never fire).
      //
      // Reminder ids are derived from (sim, kind, due date), so scheduler
      // retries, restarts and re-runs cannot duplicate. Editing the due date
      // changes the ids, so the stale notices for the old date are pruned below.
      // ----------------------------------------------------
      const nowDay = Math.floor(now / DAY_MS);
      const allSims = db.sims || [];
      const deedSims = allSims.filter((s) => !s.deedTransferCompletedAt);

      // A finished transfer must leave no future alert behind. Completed SIMs are
      // skipped by the scheduling loop, so their pending reminders have to be
      // pruned explicitly here — otherwise a reminder raised before completion
      // would sit in the bell forever.
      const completedDeedIds = new Set(
        allSims.filter((s) => s.deedTransferCompletedAt).map((s) => s.id)
      );
      if (completedDeedIds.size > 0) {
        await centralDb.mutate((database: any) => {
          database.notifications = (database.notifications || []).filter(
            (n: Notification) =>
              !(
                n.relatedEntityType === 'SIM_DEED' &&
                n.relatedEntityId &&
                completedDeedIds.has(n.relatedEntityId)
              )
          );
        });
      }

      for (const sim of deedSims) {
        const dueRaw = (sim.deedTransferDueDate || '').trim();
        // No due date chosen: schedule nothing and cancel whatever was raised
        // for a date that has since been cleared. Nothing is invented — an
        // unset date stays visibly unset, with no alert behind it.
        if (!dueRaw) {
          const verifyOnly = deedVerificationReminderId(sim.id);
          await centralDb.mutate((database: any) => {
            database.notifications = (database.notifications || []).filter((n: Notification) => {
              if (n.relatedEntityType !== 'SIM_DEED' || n.relatedEntityId !== sim.id) return true;
              return n.id === verifyOnly;
            });
          });
          continue;
        }

        const dueDate = new Date(dueRaw);
        if (isNaN(dueDate.getTime())) continue;

        const dueDay = Math.floor(dueDate.getTime() / DAY_MS);
        const overdueId = deedReminderId(sim.id, dueRaw, 'due-overdue');

        const reminders: { id: string; day: number; title: string; message: string }[] = [
          {
            id: deedReminderId(sim.id, dueRaw, 'day-before'),
            day: dueDay - 1,
            title: 'یادآور انتقال سند سیم‌کارت',
            message: `موعد پیگیری انتقال سند سیم‌کارت ${sim.phoneNumber} فردا است. لطفاً وضعیت انتقال را در پرونده سیم‌کارت ثبت کنید.`,
          },
          {
            id: deedReminderId(sim.id, dueRaw, 'on-due-date'),
            day: dueDay,
            title: 'موعد انتقال سند سیم‌کارت امروز است',
            message: `امروز موعد پیگیری انتقال سند سیم‌کارت ${sim.phoneNumber} است. لطفاً وضعیت انتقال را ثبت کنید.`,
          },
        ];

        // Drop every notice belonging to a superseded due date, so editing the
        // date never leaves a stale alert behind. The overdue follow-up and the
        // verification notice are kept: they are the CURRENT state of this SIM,
        // and pruning them would delete a live alert on the next tick.
        await centralDb.mutate((database: any) => {
          const keep = new Set<string>([
            ...reminders.map((r) => r.id),
            overdueId,
            deedVerificationReminderId(sim.id),
          ]);
          database.notifications = (database.notifications || []).filter((n: Notification) => {
            if (n.relatedEntityType !== 'SIM_DEED' || n.relatedEntityId !== sim.id) return true;
            return keep.has(n.id);
          });
        });

        // Already past due when the date was entered or edited: a past-dated
        // reminder would never fire, so raise a due/overdue follow-up instead.
        if (dueDay <= nowDay) {
          if (this.notifiedTaskKeys.has(overdueId)) continue;
          this.notifiedTaskKeys.add(overdueId);
          const alreadySent = (centralDb.getState().notifications || []).some((n) => n.id === overdueId);
          if (alreadySent) continue;

          const targetUserId = sim.assignedUserId || 'usr-admin';
          const daysLate = nowDay - dueDay;
          const savedNotif = await centralDb.saveNotification({
            id: overdueId,
            userId: targetUserId,
            title: daysLate === 0 ? 'موعد انتقال سند سیم‌کارت امروز است' : 'انتقال سند سیم‌کارت معوق شده است',
            message:
              daysLate === 0
                ? `امروز موعد پیگیری انتقال سند سیم‌کارت ${sim.phoneNumber} است. لطفاً وضعیت انتقال را ثبت کنید.`
                : `موعد پیگیری انتقال سند سیم‌کارت ${sim.phoneNumber} ${daysLate} روز پیش بوده و ثبت نشده است. لطفاً پیگیری کنید.`,
            body: `انتقال سند سیم‌کارت ${sim.phoneNumber} نیازمند پیگیری است.`,
            category: 'REMINDER',
            priority: 'HIGH',
            read: false,
            relatedEntityType: 'SIM_DEED',
            relatedEntityId: sim.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as Notification);
          await this.dispatchToUser(targetUserId, savedNotif);
          continue;
        }

        for (const rem of reminders) {
          // Fire when the reminder's day has arrived; never re-open a past
          // occurrence that is more than a day old (a long outage must not
          // spam every missed reminder at once).
          if (rem.day > nowDay || nowDay - rem.day > 1) continue;

          if (this.notifiedTaskKeys.has(rem.id)) continue;

          const alreadySent = (centralDb.getState().notifications || []).some((n) => n.id === rem.id);
          if (alreadySent) {
            this.notifiedTaskKeys.add(rem.id);
            continue;
          }

          this.notifiedTaskKeys.add(rem.id);
          const targetUserId = sim.assignedUserId || 'usr-admin';
          const notif: Notification = {
            id: rem.id,
            userId: targetUserId,
            title: rem.title,
            message: rem.message,
            body: rem.message,
            category: 'REMINDER',
            priority: 'HIGH',
            read: false,
            relatedEntityType: 'SIM_DEED',
            relatedEntityId: sim.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const savedNotif = await centralDb.saveNotification(notif);
          await this.dispatchToUser(targetUserId, savedNotif);
        }
      }

      // ----------------------------------------------------
      // 2b. Unconfirmed eligibility — verification nudge
      //
      // A SIM whose previous ownership-transfer date is unknown has no
      // calculated eligibility date to schedule against. It must NOT get a
      // reminder that pretends a deadline exists (that would be inventing a
      // date), so it gets a single, stable verification notice instead. The id
      // depends only on the SIM, so retries/restarts can never duplicate it.
      // ----------------------------------------------------
      const verifySims = allSims.filter(
        (s) => !s.deedTransferCompletedAt && computeDeedTransferEligibility(s).needsVerification
      );
      for (const sim of verifySims) {
        const verifyId = deedVerificationReminderId(sim.id);
        if (this.notifiedTaskKeys.has(verifyId)) continue;
        const alreadySent = (centralDb.getState().notifications || []).some((n) => n.id === verifyId);
        if (alreadySent) {
          this.notifiedTaskKeys.add(verifyId);
          continue;
        }
        this.notifiedTaskKeys.add(verifyId);
        const targetUserId = sim.assignedUserId || 'usr-admin';
        const savedNotif = await centralDb.saveNotification({
          id: verifyId,
          userId: targetUserId,
          title: 'بررسی سند انتقال سیم‌کارت مورد نیاز است',
          message:
            `سیم‌کارت ${sim.phoneNumber} بدون تاریخ انتقال سند قبلی ثبت شده است. ` +
            'لطفاً تاریخ انتقال سند مالکیت پیشین را در پرونده سیم‌کارت ثبت کنید تا ' +
            'تاریخ مجاز آن محاسبه و پیگیری شود.',
          body: `سیم‌کارت ${sim.phoneNumber} نیازمند بررسی سند انتقال است.`,
          category: 'REMINDER',
          priority: 'MEDIUM',
          read: false,
          relatedEntityType: 'SIM_DEED',
          relatedEntityId: sim.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as Notification);
        await this.dispatchToUser(targetUserId, savedNotif);
      }

      // ----------------------------------------------------
      // 3. Snoozed Notifications Expired
      // ----------------------------------------------------
      const notifications = db.notifications || [];
      for (const n of notifications) {
        if (!n.snoozedUntil) continue;
        const snoozeTime = new Date(n.snoozedUntil).getTime();
        if (!isNaN(snoozeTime) && snoozeTime <= now) {
          // Clear snooze and re-alert
          await centralDb.mutate((database) => {
            const idx = database.notifications.findIndex((item) => item.id === n.id);
            if (idx >= 0) {
              database.notifications[idx].snoozedUntil = undefined;
              database.notifications[idx].read = false;
              database.notifications[idx].updatedAt = new Date().toISOString();
            }
          });

          console.log(`[NotificationScheduler] Snooze expired for notification "${n.title}". Re-alerting user.`);
          const targetUserId = n.userId || 'usr-admin';
          await this.dispatchToUser(targetUserId, {
            ...n,
            title: `[یادآوری مجدد] ${n.title}`,
            snoozedUntil: undefined,
          });
        }
      }
    } catch (err) {
      console.error('[NotificationScheduler] Error during checkReminders:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  public async dispatchToUser(userId: string, notification: Notification) {
    const devices = centralDb.getUserDevices(userId).filter((d) => d.enabled);

    // 1. Record In-App delivery
    const inAppDelivery: NotificationDelivery = {
      id: `del-inapp-${notification.id}-${Date.now()}`,
      notificationId: notification.id,
      userId,
      channel: DeliveryChannel.IN_APP,
      status: DeliveryStatus.DELIVERED,
      deliveredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    await centralDb.recordDelivery(inAppDelivery);

    if (devices.length === 0) {
      console.log(`[NotificationScheduler] No registered push devices found for user ${userId}. In-app notification ready.`);
      return;
    }

    // 2. Honour the settings the UI already writes but nothing used to read:
    //    a global off switch, and quiet hours. Critical/urgent alerts bypass
    //    quiet hours so an escalation is never silently swallowed.
    const settings = centralDb.getNotificationSettings();
    if (settings?.enableNotifications === false) {
      console.log(`[NotificationScheduler] Push disabled in settings; skipping push for ${userId}.`);
      return;
    }
    const isCritical = notification.priority === 'URGENT' || notification.priority === 'HIGH' || notification.priority === 'CRITICAL';
    if (settings?.quietHoursEnabled && !isCritical && this.isWithinQuietHours(settings.quietHoursStart, settings.quietHoursEnd)) {
      console.log(`[NotificationScheduler] Within quiet hours; skipping push for ${userId}.`);
      return;
    }

    // 2. Send RFC8291 Web Push to each registered active device
    //
    // A SIM_DEED alert names a phone number, which is sensitive: the OS shows
    // the push body on the lock screen. The in-app record keeps the full
    // number (the operator needs it), but the system notification is masked.
    const pushBody =
      notification.relatedEntityType === 'SIM_DEED'
        ? (notification.message || notification.body || '').replace(/\b(09\d{2})[\s-]?(\d{3})[\s-]?(\d{4})\b/g, '$1***$3')
        : notification.message || notification.body || '';

    for (const dev of devices) {
      const pushDelivery: NotificationDelivery = {
        id: `del-push-${dev.id}-${notification.id}-${Date.now()}`,
        notificationId: notification.id,
        userId,
        notificationDeviceId: dev.id,
        deviceName: dev.deviceName,
        channel: DeliveryChannel.WEB_PUSH,
        status: DeliveryStatus.QUEUED,
        createdAt: new Date().toISOString(),
      };
      await centralDb.recordDelivery(pushDelivery);

      const res = await webPushService.sendNotification(dev, {
        title: notification.title,
        body: pushBody,
        notificationId: notification.id,
        targetType: notification.relatedEntityType,
        targetId: notification.relatedEntityId,
        priority: notification.priority,
        url: notification.relatedEntityType
          ? `/?module=${notification.relatedEntityType}&id=${notification.relatedEntityId || ''}`
          : '/',
      });

      if (res.success) {
        await centralDb.updateDelivery(pushDelivery.id, {
          status: DeliveryStatus.SENT,
          sentAt: new Date().toISOString(),
          deliveredAt: new Date().toISOString(),
        });
      } else {
        await centralDb.updateDelivery(pushDelivery.id, {
          status: DeliveryStatus.FAILED,
          failedAt: new Date().toISOString(),
          failureReason: res.error || 'Push send error',
        });

        // If subscription has expired or unsubscribed on browser side, disable device
        if (res.expired) {
          console.log(`[NotificationScheduler] Device ${dev.id} (${dev.deviceName}) subscription expired. Disabling device.`);
          await centralDb.updateDevice(dev.id, { enabled: false });
        }
      }
    }
  }

  public async sendTestNotification(
    userId: string,
    title = 'آزمایش اعلان هوشمند MMBA',
    body = 'این پیام تستی برای بررسی کارکرد صحیح اعلان‌های سیستمی و هشدار صوتی ارسال شده است.'
  ) {
    const testNotif: Notification = {
      id: `test-notif-${Date.now()}`,
      userId,
      title,
      message: body,
      body,
      category: 'SYSTEM',
      priority: 'HIGH',
      read: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await centralDb.saveNotification(testNotif);
    await this.dispatchToUser(userId, saved);
    return saved;
  }
}

export const notificationScheduler = new NotificationScheduler();
