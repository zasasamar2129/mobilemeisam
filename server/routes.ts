import { Router, Request, Response } from 'express';
import { centralDb, normalizePhone } from './db';
import * as consignmentDb from './consignmentDb';
import { backupService } from './backupService';
import { webPushService } from './webPushService';
import { notificationScheduler } from './notificationScheduler';
import { eventBus, type ChatEvent, type ChatEventType } from './eventBus';
import {
  User, UserRole, UserStatus, ModuleName, Customer, Call, Task,
  Contract, Payment, Check, SimCard, Repair, Attachment, Notification,
  Role, VoiceNote, Interaction, InteractionType, ProblemReport,
  BackupType, BackupStatus, UserNotificationDevice, NotificationSettings,
  Account, JournalEntry, AccountingPeriod, DocumentShare,
  SimPurchase, SimPurchasePayment, SimPurchaseReturn, SimSalePayment, SimSaleReturn, SimCostItem
} from '../src/types';
import { isAdmin, isGod, canViewTask, canViewAllTasks } from '../src/lib/permissions';
import {
  validateDeedTransferDueDate,
  validateDeedTransferCompletion,
  computeDeedTransferEligibility,
  computeDeedFollowStatus,
  MAX_DEED_TRANSFER_DAYS,
} from '../src/lib/deedTransfer';

export const apiRouter = Router();

/**
 * Publish a chat mutation to every live SSE stream watching this conversation.
 * Fire-and-forget: the REST response must not wait on fan-out, and the in-app
 * notification + web push are dispatched separately (see notifyChatRecipients).
 */
function publishChat(conversationId: string, type: ChatEventType, userId: string, userName: string, payload: Record<string, unknown> = {}) {
  eventBus.publish({
    type,
    conversationId,
    userId,
    userName,
    payload,
    revision: centralDb.getRevisionInfo().revision,
  });
}

/**
 * Notify everyone but the sender about a new chat message: in-app record plus
 * web push for the devices that are currently backgrounded or offline. This is
 * the only channel that survives a hidden tab, so it is what makes chat work
 * "even when the app is closed" — while the app is open, SSE delivers faster.
 *
 * Fire-and-forget on purpose: the caller's response must not wait on push.
 */
function notifyChatRecipients(conversation: any, sender: User, body: string, messageId: string) {
  const members = (conversation.member_ids || []) as string[];
  const recipientIds = members.filter((mid) => mid !== sender.id);
  if (recipientIds.length === 0) return;

  const preview = (body || '').trim().slice(0, 160) || (sender.name ? `${sender.name}` : 'پیام جدید');
  const url = `/?module=CHAT&conversationId=${encodeURIComponent(conversation.id)}`;

  for (const recipientId of recipientIds) {
    // In-app notification — always, so the bell works even without a device.
    centralDb.saveNotification({
      id: `notif-chat-${Date.now()}-${recipientId}`,
      userId: recipientId,
      title: sender.name,
      message: preview,
      category: 'CHAT',
      severity: 'INFO',
      priority: 'HIGH',
      read: false,
      createdAt: new Date().toISOString(),
      relatedEntityType: 'CONVERSATION',
      relatedEntityId: conversation.id,
      relatedCustomerName: conversation.title || undefined,
    }).catch((err) => console.warn('[Chat] in-app notify failed:', err));

    // Web push — only reaches backgrounded/offline tabs; the scheduler handles
    // quiet hours, expired subscriptions and delivery logging.
    notificationScheduler.dispatchToUser(recipientId, {
      id: `notif-chat-push-${Date.now()}-${recipientId}`,
      userId: recipientId,
      title: sender.name,
      message: preview,
      body: preview,
      category: 'CHAT',
      priority: 'HIGH',
      read: false,
      createdAt: new Date().toISOString(),
      relatedEntityType: 'CONVERSATION',
      relatedEntityId: conversation.id,
      relatedCustomerName: conversation.title || undefined,
    }).catch((err) => console.warn('[Chat] push dispatch failed:', err));
  }
}

// Middleware: Extract user from Authorization Header or query parameter
export function getAuthUser(req: Request): User | undefined {
  let token = '';
  const authHeader = req.headers.authorization;
  if (authHeader) {
    token = authHeader.replace('Bearer ', '').trim();
  } else if (typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }
  if (!token) return undefined;
  
  // Format can be raw userId or token-user_id
  const userId = token.startsWith('token-') ? token.substring(6) : token;
  const user = centralDb.findUserById(userId);
  if (user && user.status !== UserStatus.INACTIVE && user.status !== UserStatus.SUSPENDED) {
    return user;
  }
  return undefined;
}

/**
 * Task visibility for the central sync payload, matching `GET /tasks`.
 * The client reads tasks from `/sync/all`, so without this the management-view
 * fix is cosmetic — every caller would still receive the whole table.
 */
function visibleTasksFor(user: User | undefined): Task[] {
  const tasks = centralDb.getState().tasks;
  if (!user) return [];
  return canViewAllTasks(user) ? tasks : tasks.filter((task) => canViewTask(user, task));
}

/**
 * The eligible assignees for the Task Inbox's employee grouping control, scoped
 * to the caller's authorized management view.
 *
 * Built from the real user table — never a hardcoded list. A non-manager gets an
 * empty list rather than a directory of colleagues, so the grouping control
 * cannot become an information leak for ordinary employees. Deactivated and
 * suspended accounts are omitted from the *options* but are still reported in
 * the caller's task data, so historical tasks never silently disappear.
 */
function eligibleAssigneesFor(user: User | undefined): { id: string; name: string }[] {
  if (!user || !canViewAllTasks(user)) return [];
  return centralDb
    .getState()
    .users.filter((u) => u.status !== UserStatus.INACTIVE && u.status !== UserStatus.SUSPENDED)
    .map((u) => ({ id: u.id, name: u.name || u.username || u.id }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
}

/**
 * Applies an employee scope to a task list the caller is already allowed to see.
 *
 * The scope is applied ON TOP of `canViewTask`, never instead of it: an employee
 * who passes `assigneeId` for a colleague still receives nothing, because the
 * permission filter has already removed those rows. `UNASSIGNED` selects the
 * tasks with no assignee — visible only where the caller's scope already covers
 * them.
 */
function applyAssigneeScope(tasks: Task[], assigneeId: string | undefined): Task[] {
  if (!assigneeId) return tasks;
  if (assigneeId === 'UNASSIGNED') return tasks.filter((t) => !t.assignedUserId);
  return tasks.filter((t) => t.assignedUserId === assigneeId);
}

/**
 * Single entry point for the ownership-transfer data on every write path — the
 * SIM routes, the purchase route and the batch sync push.
 *
 * The operator's manual due date is authoritative and is stored exactly as
 * sent: it is never calculated, never overwritten from the purchase date and
 * never clamped to the 20-day window, because different SIMs legitimately carry
 * different operational due dates. The calculated eligibility date is only
 * compared against it, and a mismatch produces a warning the caller surfaces —
 * not a refusal, and never a silent rewrite.
 */
function applyDeedTransferRule(
  sim: Partial<SimCard>,
  user: User | undefined,
  existing?: SimCard
): { sim: Partial<SimCard>; error?: string; warnings: string[]; auditOverride?: string } {
  const merged = { ...existing, ...sim } as SimCard;
  const priorOverride = existing?.deedTransferOverride;
  const warnings: string[] = [];

  // "Unset" must be one state, not three. A cleared date is sent as null (an
  // omitted key means "leave it alone", which the spread above already handles).
  // Normalise here so the stored record never carries an empty string, and so a
  // cleared due date genuinely clears instead of being silently kept.
  for (const key of ['deedTransferDueDate', 'previousTransferDate'] as const) {
    const value = merged[key] as unknown;
    if (value === null || (typeof value === 'string' && value.trim() === '')) {
      (merged as unknown as Record<string, unknown>)[key] = undefined;
    }
  }

  // A malformed due date is the only fatal case. Everything else is advisory:
  // the operator's manual date is never refused for being outside the legal
  // window, it is only flagged so the record is never read as eligible.
  const dueCheck = validateDeedTransferDueDate({
    previousTransferDate: merged.previousTransferDate,
    purchaseDate: merged.purchaseDate,
    deedTransferDueDate: merged.deedTransferDueDate,
    deedTransferOverride: merged.deedTransferOverride,
    deedTransferOverrideReason: merged.deedTransferOverrideReason,
    canOverride: Boolean(user && isAdmin(user)),
  });
  if (!dueCheck.ok) {
    return {
      sim: merged,
      warnings,
      error: dueCheck.warning || 'تاریخ سررسید انتقال سند نامعتبر است.',
    };
  }
  if (dueCheck.warning) warnings.push(dueCheck.warning);

  // Recording a completion is an operational fact and is never blocked; the
  // warning is what keeps the record from reading as legally eligible.
  const completionCheck = validateDeedTransferCompletion({
    previousTransferDate: merged.previousTransferDate,
    purchaseDate: merged.purchaseDate,
    deedTransferCompletedAt: merged.deedTransferCompletedAt,
    deedTransferOverride: merged.deedTransferOverride,
    deedTransferOverrideReason: merged.deedTransferOverrideReason,
    canOverride: Boolean(user && isAdmin(user)),
  });
  if (completionCheck.warning) warnings.push(completionCheck.warning);

  // Stamp who recorded an exception and when, so a documented deviation is
  // auditable rather than merely asserted. A previously stamped exception keeps
  // its original author instead of being rewritten on an unrelated save.
  //
  // An unauthorised override flag is stripped outright: a caller cannot waive
  // the advisory warning by simply asserting the flag. The date is still
  // stored — nothing is refused — but the warning stands and the flag does not.
  let auditOverride: string | undefined;
  const overrideAuthorised = Boolean(
    merged.deedTransferOverride &&
    merged.deedTransferOverrideReason?.trim() &&
    user &&
    isAdmin(user)
  );

  if (overrideAuthorised) {
    if (!priorOverride && user) {
      merged.deedTransferOverrideByUserId = user.id;
      merged.deedTransferOverrideAt = new Date().toISOString();
      auditOverride =
        `استثنای انتقال سند سیم‌کارت ${merged.phoneNumber || merged.id}: ` +
        merged.deedTransferOverrideReason.trim();
    } else if (priorOverride && existing?.deedTransferOverrideByUserId) {
      merged.deedTransferOverrideByUserId = existing.deedTransferOverrideByUserId;
      merged.deedTransferOverrideAt = existing.deedTransferOverrideAt;
    }
  } else if (merged.deedTransferOverride) {
    merged.deedTransferOverride = undefined;
    merged.deedTransferOverrideReason = undefined;
    merged.deedTransferOverrideByUserId = undefined;
    merged.deedTransferOverrideAt = undefined;
  }

  // Undoing a completion drops the exception that justified it.
  if (existing?.deedTransferCompletedAt && !merged.deedTransferCompletedAt) {
    merged.deedTransferOverride = undefined;
    merged.deedTransferOverrideReason = undefined;
    merged.deedTransferOverrideByUserId = undefined;
    merged.deedTransferOverrideAt = undefined;
  }

  // A finished transfer keeps no pending deadline: the completion supersedes
  // the follow-up date, and clearing it gives the reminder pass a single
  // source of truth (the completion flag), so no stale alert can fire.
  if (merged.deedTransferCompletedAt) {
    merged.deedTransferDueDate = undefined;
  }

  return { sim: merged, warnings, auditOverride };
}

/**
 * The deed-transfer block every SIM response carries: the operator's manual due
 * date and its follow-up status, plus the separately calculated legal
 * eligibility. Both are returned so a client never has to re-derive either and
 * risk disagreeing with the scheduler.
 */
function deedPayload(sim: Partial<SimCard>) {
  const follow = computeDeedFollowStatus(sim);
  return {
    deedFollowStatus: follow.status,
    deedFollowRemainingDays: follow.remainingDays,
    deedEligibility: computeDeedTransferEligibility(sim),
  };
}

/** Persist the audit record for an authorized exception. Never throws upward. */async function auditDeedOverride(user: User | undefined, details: string, simId: string) {
  try {
    await centralDb.logAudit({
      userId: user?.id,
      userName: user?.name,
      userRole: user?.role,
      action: 'SIM_DEED_TRANSFER_OVERRIDE',
      module: ModuleName.SIM_INVENTORY,
      entityType: 'SIM',
      targetId: simId,
      details,
    });
  } catch (err) {
    console.error('Failed to audit deed-transfer override:', err);
  }
}

// ----------------------------------------------------
// Health Check
// ----------------------------------------------------
apiRouter.get('/health', (req: Request, res: Response) => {
  const rev = centralDb.getRevisionInfo();
  res.json({
    status: 'ok',
    system: 'MMBA Centralized Production Engine',
    revision: rev.revision,
    lastUpdatedAt: rev.lastUpdatedAt,
    serverTime: new Date().toISOString(),
  });
});

// ----------------------------------------------------
// Authentication & Profile Endpoints
// ----------------------------------------------------
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { usernameOrEmail, password } = req.body;
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ success: false, message: 'نام کاربری/ایمیل و رمز عبور الزامی است.' });
    }

    const user = centralDb.findUserByCredential(usernameOrEmail);
    if (!user) {
      return res.status(401).json({ success: false, message: 'کاربری با این نام کاربری، ایمیل یا شماره موبایل یافت نشد.' });
    }

    if (user.status === UserStatus.INACTIVE || user.status === UserStatus.SUSPENDED) {
      return res.status(403).json({ success: false, message: 'حساب کاربری شما غیرفعال یا معلق می‌باشد. لطفاً با مدیر سیستم تماس بگیرید.' });
    }

    const expectedPassword = user.password || '123';
    if (password !== expectedPassword) {
      await centralDb.logAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'تلاش ناموفق برای ورود به سیستم',
        module: ModuleName.USERS,
        details: `رمز عبور اشتباه برای کاربر ${user.username}`,
        ipAddress: req.ip,
      });
      return res.status(401).json({ success: false, message: 'رمز عبور وارد شده نادرست است.' });
    }

    const now = new Date().toISOString();
    const updatedUser: User = {
      ...user,
      lastLoginAt: now,
    };
    await centralDb.saveUser(updatedUser);

    await centralDb.logAudit({
      userId: updatedUser.id,
      userName: updatedUser.name,
      userRole: updatedUser.role,
      action: 'ورود موفق به سیستم متمرکز MMBA',
      module: ModuleName.USERS,
      details: `ورود موفق کاربر ${updatedUser.name} (${updatedUser.username}) از دستگاه`,
      ipAddress: req.ip,
    });

    const token = `token-${updatedUser.id}`;
    res.json({
      success: true,
      token,
      user: updatedUser,
      serverRevision: centralDb.getRevisionInfo().revision,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'خطای سرور در احراز هویت' });
  }
});

apiRouter.get('/auth/me', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (!user) {
    // Return default admin if no auth specified, or 401
    const state = centralDb.getState();
    return res.json({ user: state.users[0] || null });
  }
  res.json({ user });
});

apiRouter.put('/auth/profile', async (req: Request, res: Response) => {
  try {
    const { userId, name, email, mobile, department, avatar, username } = req.body;
    const authUser = getAuthUser(req);
    const targetId = userId || authUser?.id || (username === 'admin' ? 'usr-admin' : undefined);

    let targetUser = targetId ? centralDb.findUserById(targetId) : undefined;
    if (!targetUser && username) {
      targetUser = centralDb.findUserByCredential(username);
    }
    if (!targetUser && !targetId) {
      targetUser = centralDb.findUserById('usr-admin') || centralDb.getState().users[0];
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'کاربر مورد نظر یافت نشد.' });
    }

    const updatedUser: User = {
      ...targetUser,
      name: name !== undefined ? name.trim() : targetUser.name,
      email: email !== undefined ? email.trim() : targetUser.email,
      mobile: mobile !== undefined ? mobile.trim() : targetUser.mobile,
      department: department !== undefined ? department.trim() : targetUser.department,
      avatar: avatar !== undefined ? avatar : targetUser.avatar,
    };

    const saved = await centralDb.saveUser(updatedUser);

    await centralDb.logAudit({
      userId: saved.id,
      userName: saved.name,
      userRole: saved.role,
      action: 'ویرایش مشخصات پروفایل کاربری',
      module: ModuleName.USERS,
      targetId: saved.id,
      targetType: 'USER',
      details: `مشخصات پروفایل کاربر ${saved.name} (@${saved.username}) در سرور متمرکز به‌روزرسانی شد.`,
      ipAddress: req.ip,
    });

    res.json({ success: true, user: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (error: any) {
    console.error('Profile update error:', error);
    res.status(500).json({ success: false, message: 'خطا در ذخیره‌سازی پروفایل' });
  }
});

apiRouter.put('/auth/password', async (req: Request, res: Response) => {
  try {
    const { userId, currentPassword, newPassword, username } = req.body;
    const authUser = getAuthUser(req);
    const targetId = userId || authUser?.id || (username === 'admin' ? 'usr-admin' : undefined);

    let targetUser = targetId ? centralDb.findUserById(targetId) : undefined;
    if (!targetUser && username) {
      targetUser = centralDb.findUserByCredential(username);
    }
    if (!targetUser && !targetId) {
      targetUser = centralDb.findUserById('usr-admin') || centralDb.getState().users[0];
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'کاربر یافت نشد.' });
    }

    const currentActual = targetUser.password || '123';
    if (currentPassword !== currentActual) {
      return res.status(400).json({ success: false, message: 'کلمه عبور فعلی نادرست است.' });
    }

    if (!newPassword || newPassword.length < 3) {
      return res.status(400).json({ success: false, message: 'کلمه عبور جدید باید حداقل ۳ کاراکتر باشد.' });
    }

    const updatedUser: User = {
      ...targetUser,
      password: newPassword,
    };

    const saved = await centralDb.saveUser(updatedUser);

    await centralDb.logAudit({
      userId: saved.id,
      userName: saved.name,
      userRole: saved.role,
      action: 'تغییر رمز عبور حساب کاربری',
      module: ModuleName.USERS,
      targetId: saved.id,
      targetType: 'USER',
      details: `رمز عبور کاربر ${saved.name} در سرور مرکزی با موفقیت تغییر کرد.`,
      ipAddress: req.ip,
    });

    res.json({ success: true, user: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (error: any) {
    console.error('Password change error:', error);
    res.status(500).json({ success: false, message: 'خطا در تغییر رمز عبور' });
  }
});

// ----------------------------------------------------
// Central Database Full Sync & Revision Check
// ----------------------------------------------------
apiRouter.get('/sync/all', (req: Request, res: Response) => {
  try {
    const state = centralDb.getState();
    res.json({
      success: true,
      revision: state.revision,
      lastUpdatedAt: state.lastUpdatedAt,
      data: {
        users: state.users,
        roles: state.roles,
        customers: state.customers,
        leads: state.leads || [],
        calls: state.calls,
        interactions: state.interactions || [],
        voiceNotes: state.voiceNotes,
        tasks: visibleTasksFor(getAuthUser(req)),
        contracts: state.contracts,
        payments: state.payments,
        checks: state.checks,
        sims: state.sims,
        repairs: state.repairs,
        attachments: state.attachments,
        accounts: state.accounts || [],
        journalEntries: state.journalEntries || [],
        journalEntryLines: state.journalEntryLines || [],
        accountingPeriods: state.accountingPeriods || [],
        documentShares: state.documentShares || [],
        conversations: state.conversations || [],
        chatMessages: state.chatMessages || [],
        registeredHolders: state.registeredHolders || [],
        contractInstallments: state.contractInstallments || [],
        simPurchases: state.simPurchases || [],
        simPurchasePayments: state.simPurchasePayments || [],
        simPurchaseReturns: state.simPurchaseReturns || [],
        simSalePayments: state.simSalePayments || [],
        simSaleReturns: state.simSaleReturns || [],
        simCostItems: state.simCostItems || [],
        trustedBiometricDevices: state.trustedBiometricDevices || [],
        notifications: state.notifications,
        auditLogs: state.auditLogs,
        dateSuggestions: state.dateSuggestions,
        sharedLinks: state.sharedLinks,
        settings: state.settings,
      },
    });
  } catch (error: any) {
    console.error('Sync all error:', error);
    res.status(500).json({ success: false, message: 'خطا در همگام‌سازی اطلاعات پایگاه داده مرکزی' });
  }
});

apiRouter.get('/sync/version', (req: Request, res: Response) => {
  const rev = centralDb.getRevisionInfo();
  res.json({
    revision: rev.revision,
    lastUpdatedAt: rev.lastUpdatedAt,
  });
});

apiRouter.post('/sync/push', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    // A batch push is a write path like any other: without this, a client could
    // bypass the ownership-transfer rule that POST/PUT /sims enforces.
    const overridesToAudit: { details: string; simId: string }[] = [];
    if (Array.isArray(payload?.sims)) {
      const user = getAuthUser(req);
      const stored = centralDb.getState().sims;
      for (const pushed of payload.sims as SimCard[]) {
        const existing = stored.find((s) => s.id === pushed?.id);
        const rule = applyDeedTransferRule(pushed, user, existing);
        if (rule.error) {
          return res.status(400).json({ success: false, message: rule.error });
        }
        Object.assign(pushed, rule.sim);
        if (rule.auditOverride) {
          overridesToAudit.push({ details: rule.auditOverride, simId: pushed.id });
        }
      }
    }
    const updatedState = await centralDb.batchSyncPush(payload);
    for (const o of overridesToAudit) {
      await auditDeedOverride(getAuthUser(req), o.details, o.simId);
    }
    res.json({
      success: true,
      revision: updatedState.revision,
      lastUpdatedAt: updatedState.lastUpdatedAt,
    });
  } catch (error: any) {
    console.error('Sync push error:', error);
    res.status(500).json({ success: false, message: 'خطا در اعمال همگام‌سازی دسته‌ای' });
  }
});

// ----------------------------------------------------
// Contact Quick Lookup (Customers vs Leads)
// ----------------------------------------------------
apiRouter.get('/contacts/lookup', (req: Request, res: Response) => {
  try {
    const rawQuery = (req.query.mobile || req.query.query || req.query.q) as string;
    if (!rawQuery) {
      return res.status(400).json({ success: false, message: 'شماره تماس یا شناسه الزامی است.' });
    }

    const norm = normalizePhone(rawQuery);
    const state = centralDb.getState();

    // 1. Check existing customer
    const customer = state.customers.find((c) => {
      const cMob = normalizePhone(c.mobile);
      const cPh = normalizePhone(c.phone);
      return (norm && (cMob === norm || cPh === norm)) || c.id === rawQuery || c.code === rawQuery;
    });

    if (customer) {
      const interactions = (state.interactions || []).filter((i) => i.customer_id === customer.id || i.customerId === customer.id);
      const contracts = (state.contracts || []).filter((c) => c.customerId === customer.id);
      const payments = (state.payments || []).filter((p) => p.customerId === customer.id);
      const lastInteraction = interactions[0];

      return res.json({
        success: true,
        contactType: 'CUSTOMER',
        customer,
        lead: null,
        stats: {
          interactionCount: interactions.length,
          contractCount: contracts.length,
          totalPaid: payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
          lastContactAt: lastInteraction?.started_at || lastInteraction?.startedAt || customer.createdAt,
          lastOutcome: lastInteraction?.outcome,
        },
      });
    }

    // 2. Check existing Lead
    const lead = (state.leads || []).find((l) => {
      const lMob = normalizePhone(l.mobile);
      return (norm && lMob === norm) || l.id === rawQuery || l.leadCode === rawQuery;
    });

    if (lead) {
      const interactions = (state.interactions || []).filter((i) => i.lead_id === lead.id || i.leadId === lead.id || (i.customerMobile && normalizePhone(i.customerMobile) === norm));
      const lastInteraction = interactions[0];

      return res.json({
        success: true,
        contactType: 'LEAD',
        customer: null,
        lead,
        stats: {
          interactionCount: interactions.length,
          lastContactAt: lead.lastContactAt || lastInteraction?.started_at || lead.createdAt,
          lastOutcome: lastInteraction?.outcome,
        },
      });
    }

    // 3. Unknown contact
    return res.json({
      success: true,
      contactType: 'UNKNOWN',
      customer: null,
      lead: null,
      mobile: norm || rawQuery,
      stats: {
        interactionCount: 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// Leads CRUD & Conversion (Sprint 02 Patch 01)
// ----------------------------------------------------
apiRouter.get('/leads', (req: Request, res: Response) => {
  try {
    const { status, query, q, creatorId, sortBy } = req.query;
    const leads = centralDb.getLeads({
      status: status as string | undefined,
      query: (query || q) as string | undefined,
      creatorId: creatorId as string | undefined,
      sortBy: sortBy as 'newest' | 'oldest' | 'code' | undefined,
    });
    res.json({ success: true, leads });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/leads/:id', (req: Request, res: Response) => {
  const lead = centralDb.findLeadById(req.params.id);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'سرنخ مورد نظر یافت نشد.' });
  }
  res.json({ success: true, lead });
});

apiRouter.post('/leads', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body.mobile) {
      return res.status(400).json({ success: false, message: 'شماره همراه برای سرنخ الزامی است.' });
    }
    const saved = await centralDb.saveLead(body);
    const authUser = getAuthUser(req);
    await centralDb.logAudit({
      userId: authUser?.id || 'system',
      userName: authUser?.name || 'کاربر سیستم',
      userRole: authUser?.role || UserRole.SUPER_ADMIN,
      action: 'ثبت سرنخ جدید (Lead)',
      module: ModuleName.LEADS,
      targetId: saved.id,
      targetType: 'LEAD',
      details: `سرنخ جدید با شماره ${saved.mobile} (${saved.leadCode}) در سامانه ثبت گردید.`,
      ipAddress: req.ip,
    });
    res.json({ success: true, lead: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.put('/leads/:id', async (req: Request, res: Response) => {
  try {
    const saved = await centralDb.saveLead({ ...req.body, id: req.params.id });
    res.json({ success: true, lead: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/leads/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await centralDb.deleteLead(req.params.id);
    res.json({ success: deleted, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/leads/:id/convert', async (req: Request, res: Response) => {
  try {
    const leadId = req.params.id;
    const customerData = req.body || {};
    const result = await centralDb.convertLeadToCustomer(leadId, customerData);

    const authUser = getAuthUser(req);
    await centralDb.logAudit({
      userId: authUser?.id || 'system',
      userName: authUser?.name || 'کاربر سیستم',
      userRole: authUser?.role || UserRole.SUPER_ADMIN,
      action: 'تبدیل سرنخ به مشتری (Lead Conversion)',
      module: ModuleName.CUSTOMERS,
      targetId: result.customer.id,
      targetType: 'CUSTOMER',
      details: `سرنخ ${result.lead.leadCode} (${result.lead.mobile}) با موفقیت به مشتری رسمی ${result.customer.name} تبدیل گردید.`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      customer: result.customer,
      lead: result.lead,
      revision: centralDb.getRevisionInfo().revision,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// Customers CRUD
// ----------------------------------------------------
apiRouter.get('/customers', (req: Request, res: Response) => {
  res.json({ customers: centralDb.getState().customers });
});

apiRouter.post('/customers', async (req: Request, res: Response) => {
  try {
    const customer: Customer = req.body;
    const saved = await centralDb.saveCustomer(customer);
    const authUser = getAuthUser(req);
    await centralDb.logAudit({
      userId: authUser?.id || 'system',
      userName: authUser?.name || 'کاربر سیستم',
      userRole: authUser?.role || UserRole.SUPER_ADMIN,
      action: 'ثبت مخاطب / مشتری جدید',
      module: ModuleName.CUSTOMERS,
      targetId: saved.id,
      targetType: 'CUSTOMER',
      details: `مشتری جدید با نام ${saved.name} (شناسه: ${saved.id}) در سرور مرکزی ثبت شد.`,
      ipAddress: req.ip,
    });
    res.json({ success: true, customer: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.put('/customers/:id', async (req: Request, res: Response) => {
  try {
    const customer: Customer = { ...req.body, id: req.params.id };
    const saved = await centralDb.saveCustomer(customer);
    const authUser = getAuthUser(req);
    await centralDb.logAudit({
      userId: authUser?.id || 'system',
      userName: authUser?.name || 'کاربر سیستم',
      userRole: authUser?.role || UserRole.SUPER_ADMIN,
      action: 'ویرایش اطلاعات مشتری',
      module: ModuleName.CUSTOMERS,
      targetId: saved.id,
      targetType: 'CUSTOMER',
      details: `اطلاعات مشتری ${saved.name} در سرور مرکزی ویرایش شد.`,
      ipAddress: req.ip,
    });
    res.json({ success: true, customer: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/customers/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const customer = centralDb.getState().customers.find((c) => c.id === id);
    const deleted = await centralDb.deleteCustomer(id);
    const authUser = getAuthUser(req);
    if (deleted && customer) {
      await centralDb.logAudit({
        userId: authUser?.id || 'system',
        userName: authUser?.name || 'کاربر سیستم',
        userRole: authUser?.role || UserRole.SUPER_ADMIN,
        action: 'حذف مشتری',
        module: ModuleName.CUSTOMERS,
        targetId: id,
        targetType: 'CUSTOMER',
        details: `مشتری ${customer.name} از سرور مرکزی حذف گردید.`,
        ipAddress: req.ip,
      });
    }
    res.json({ success: deleted, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/customers/bulk-delete', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, message: 'لیست شناسه‌ها نامعتبر است' });
    }
    const count = await centralDb.deleteMultipleCustomers(ids);
    res.json({ success: true, count, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// Calls & Voice Notes CRUD
// ----------------------------------------------------
apiRouter.get('/calls', (req: Request, res: Response) => {
  res.json({ calls: centralDb.getState().calls });
});

apiRouter.post('/calls', async (req: Request, res: Response) => {
  try {
    const call: Call = req.body;
    const saved = await centralDb.saveCall(call);
    res.json({ success: true, call: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/calls/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await centralDb.deleteCall(req.params.id);
    res.json({ success: deleted, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// Interactions (Call Center Engine - Sprint 02 Vertical Slice)
// Base paths: /api/v1/interactions and /api/interactions
// ----------------------------------------------------
apiRouter.get('/interactions', (req: Request, res: Response) => {
  try {
    const {
      customerId,
      customer_id,
      type,
      interaction_type,
      from,
      to,
      followUpRequired,
      follow_up_required,
      followUpFrom,
      followUpTo,
      page,
      pageSize,
    } = req.query;

    const filterCustomerId = (customerId || customer_id) as string | undefined;
    const filterType = (type || interaction_type) as string | undefined;
    const filterFollowUp = followUpRequired !== undefined
      ? followUpRequired === 'true' || followUpRequired === '1'
      : follow_up_required !== undefined
      ? follow_up_required === 'true' || follow_up_required === '1'
      : undefined;

    const list = centralDb.getInteractions({
      customerId: filterCustomerId,
      type: filterType,
      from: from as string | undefined,
      to: to as string | undefined,
      followUpRequired: filterFollowUp,
      followUpFrom: followUpFrom as string | undefined,
      followUpTo: followUpTo as string | undefined,
    });

    const p = page ? Math.max(1, parseInt(page as string, 10)) : 1;
    const ps = pageSize ? Math.max(1, parseInt(pageSize as string, 10)) : list.length || 50;
    const startIndex = (p - 1) * ps;
    const paginated = list.slice(startIndex, startIndex + ps);

    res.json({
      success: true,
      interactions: paginated,
      total: list.length,
      page: p,
      pageSize: ps,
      totalPages: Math.ceil(list.length / ps) || 1,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

apiRouter.get('/interactions/:id', (req: Request, res: Response) => {
  const interaction = centralDb.findInteractionById(req.params.id);
  if (!interaction) {
    return res.status(404).json({
      error: 'INTERACTION_NOT_FOUND',
      message: 'تعامل یا مکالمه مورد نظر یافت نشد.',
    });
  }
  res.json({ success: true, interaction });
});

apiRouter.post('/interactions', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const customerId = (body.customer_id || body.customerId) as string | undefined;
    const leadId = (body.lead_id || body.leadId) as string | undefined;
    const mobile = (body.customerMobile || body.mobile) as string | undefined;
    const interactionType = (body.interaction_type || body.interactionType || 'incoming_call') as string;
    const startedAt = (body.started_at || body.startedAt || body.dateTime || new Date().toISOString()) as string;
    const followUpRequired = Boolean(body.follow_up_required || body.followUpRequired);
    const followUpAt = (body.follow_up_at || body.followUpAt || body.followUpDate) as string | undefined;
    const followUpUserId = (body.follow_up_user_id || body.followUpUserId) as string | undefined;

    // 1. Validation: At least one of customerId, leadId, or mobile is required
    if (!customerId && !leadId && !mobile) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'ثبت تماس و تعامل نیازمند حداقل یکی از موارد: انتخاب مشتری، انتخاب سرنخ، یا وارد کردن شماره همراه است.',
      });
    }

    // 2. Validation: follow-up requirements
    if (followUpRequired) {
      if (!followUpAt) {
        return res.status(400).json({
          error: 'FOLLOW_UP_DATE_REQUIRED',
          message: 'در صورت فعال بودن پیگیری، تاریخ و ساعت پیگیری الزامی است.',
        });
      }
      if (!followUpUserId) {
        return res.status(400).json({
          error: 'FOLLOW_UP_USER_REQUIRED',
          message: 'در صورت فعال بودن پیگیری، انتخاب کارشناس مسئول پیگیری الزامی است.',
        });
      }
    }

    // 3. Authenticated user
    const authUser = getAuthUser(req);
    const recordingUserId = authUser?.id || body.user_id || body.userId || 'usr-admin';
    const recordingUserName = authUser?.name || body.userName || 'کارشناس سامانه';

    // 4. Save interaction through centralDb (which handles lead creation / matching, task generation, dual-write)
    const saved = await centralDb.saveInteraction({
      ...body,
      user_id: recordingUserId,
      userId: recordingUserId,
      userName: recordingUserName,
      interaction_type: interactionType,
      interactionType: interactionType,
      started_at: startedAt,
      startedAt: startedAt,
      follow_up_required: followUpRequired,
      followUpRequired: followUpRequired,
      follow_up_at: followUpAt,
      followUpAt: followUpAt,
      follow_up_user_id: followUpUserId,
      followUpUserId: followUpUserId,
    });

    // 5. Audit log
    await centralDb.logAudit({
      userId: recordingUserId,
      userName: recordingUserName,
      userRole: authUser?.role || UserRole.SUPER_ADMIN,
      action: 'ثبت تعامل و مکالمه در مرکز تماس (Call Center)',
      module: ModuleName.CALLS,
      targetId: saved.id,
      targetType: 'INTERACTION',
      details: `تعامل ${saved.interaction_type} برای ${saved.customerName || saved.customerMobile} (شناسه: ${saved.id}) ثبت شد.`,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      interaction: saved,
      revision: centralDb.getRevisionInfo().revision,
    });
  } catch (err: any) {
    console.error('Save interaction error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

apiRouter.patch('/interactions/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const existing = centralDb.findInteractionById(id);
    if (!existing) {
      return res.status(404).json({
        error: 'INTERACTION_NOT_FOUND',
        message: 'تعامل مورد نظر یافت نشد.',
      });
    }

    const body = req.body || {};
    if (body.follow_up_required === true || body.followUpRequired === true) {
      const followUpAt = body.follow_up_at || body.followUpAt || existing.follow_up_at;
      const followUpUserId = body.follow_up_user_id || body.followUpUserId || existing.follow_up_user_id;
      if (!followUpAt) {
        return res.status(400).json({
          error: 'FOLLOW_UP_DATE_REQUIRED',
          message: 'تاریخ و زمان پیگیری الزامی است.',
        });
      }
      if (!followUpUserId) {
        return res.status(400).json({
          error: 'FOLLOW_UP_USER_REQUIRED',
          message: 'انتخاب کارشناس مسئول پیگیری الزامی است.',
        });
      }
    }

    const updated = await centralDb.patchInteraction(id, body);
    const authUser = getAuthUser(req);
    await centralDb.logAudit({
      userId: authUser?.id || 'system',
      userName: authUser?.name || 'کاربر سیستم',
      userRole: authUser?.role || UserRole.SUPER_ADMIN,
      action: 'ویرایش اطلاعات تعامل / مکالمه',
      module: ModuleName.CALLS,
      targetId: id,
      targetType: 'INTERACTION',
      details: `اطلاعات تعامل ${id} با موفقیت ویرایش و ممیزی شد.`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      interaction: updated,
      revision: centralDb.getRevisionInfo().revision,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

apiRouter.post('/interactions/:id/complete-follow-up', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const existing = centralDb.findInteractionById(id);
    if (!existing) {
      return res.status(404).json({
        error: 'INTERACTION_NOT_FOUND',
        message: 'تعامل مورد نظر یافت نشد.',
      });
    }

    const updated = await centralDb.completeInteractionFollowUp(id);
    const authUser = getAuthUser(req);
    await centralDb.logAudit({
      userId: authUser?.id || 'system',
      userName: authUser?.name || 'کاربر سیستم',
      userRole: authUser?.role || UserRole.SUPER_ADMIN,
      action: 'تکمیل پیگیری تعامل / تماس',
      module: ModuleName.CALLS,
      targetId: id,
      targetType: 'INTERACTION',
      details: `پیگیری تعامل ${id} به عنوان تکمیل‌شده علامت‌گذاری شد.`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      interaction: updated,
      revision: centralDb.getRevisionInfo().revision,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

apiRouter.delete('/interactions/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const existing = centralDb.findInteractionById(id);
    if (!existing) {
      return res.status(404).json({
        error: 'INTERACTION_NOT_FOUND',
        message: 'تعامل مورد نظر یافت نشد.',
      });
    }

    const deleted = await centralDb.deleteInteraction(id);
    const authUser = getAuthUser(req);
    await centralDb.logAudit({
      userId: authUser?.id || 'system',
      userName: authUser?.name || 'کاربر سیستم',
      userRole: authUser?.role || UserRole.SUPER_ADMIN,
      action: 'حذف تعامل / مکالمه از مرکز تماس',
      module: ModuleName.CALLS,
      targetId: id,
      targetType: 'INTERACTION',
      details: `تعامل ${id} با موضوع "${existing.subject}" حذف شد.`,
      ipAddress: req.ip,
    });

    res.json({
      success: deleted,
      revision: centralDb.getRevisionInfo().revision,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

apiRouter.get('/voice-notes', (req: Request, res: Response) => {
  res.json({ voiceNotes: centralDb.getState().voiceNotes });
});

// Audio streaming endpoint with HTTP Range Request (206 Partial Content) support for iOS/Safari/iPhone
apiRouter.get('/voice-notes/:id/audio', (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const vn = centralDb.getState().voiceNotes.find((n) => n.id === id);
    if (!vn || !vn.audioDataUrl) {
      return res.status(404).send('Audio not found');
    }

    const dataUrl = vn.audioDataUrl;
    const matches = dataUrl.match(/^data:([a-zA-Z0-9\/+-.]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).send('Invalid audio data format');
    }

    const mimeType = matches[1] || 'audio/wav';
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    const totalSize = buffer.length;

    // Handle HTTP Range Requests (Essential for iOS Safari playback & scrubbing)
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=86400',
      });
      res.end(buffer.subarray(start, end + 1));
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=86400',
      });
      res.end(buffer);
    }
  } catch (err: any) {
    console.error('Audio streaming error:', err);
    res.status(500).send('Internal audio streaming error');
  }
});

apiRouter.post('/voice-notes', async (req: Request, res: Response) => {
  try {
    const vn: VoiceNote = req.body;
    const saved = await centralDb.saveVoiceNote(vn);
    res.json({ success: true, voiceNote: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/voice-notes/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await centralDb.deleteVoiceNote(req.params.id);
    res.json({ success: deleted, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Edit Text/Voice note — owner-or-admin only (Sprint 03 Patch 05)
apiRouter.put('/voice-notes/:id', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const id = req.params.id;
    const existing = centralDb.getState().voiceNotes.find((n) => n.id === id);
    if (!existing) return res.status(404).json({ success: false, message: 'یادداشت یافت نشد' });
    if (!authUser || !(authUser.id === existing.createdById || isAdmin(authUser))) {
      return res.status(403).json({ success: false, message: 'تنها نویسنده یا مدیر مجاز به ویرایش این یادداشت است.' });
    }
    const now = new Date().toISOString();
    const updated: VoiceNote = { ...existing, ...req.body, id: existing.id, updatedAt: now, updatedById: authUser.id, updatedByName: authUser.name, editedAt: now };
    const saved = await centralDb.saveVoiceNote(updated);
    res.json({ success: true, voiceNote: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// Tasks CRUD
// ----------------------------------------------------
apiRouter.get('/tasks', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const assigneeId = typeof req.query.assigneeId === 'string' ? req.query.assigneeId : undefined;
  // Permission filter first, employee scope second — the order is what stops a
  // crafted `assigneeId` from widening an ordinary employee's view.
  const tasks = applyAssigneeScope(visibleTasksFor(user), assigneeId);
  res.json({
    tasks,
    // Only a manager receives the roster; everyone else gets an empty list.
    assignees: eligibleAssigneesFor(user),
    // Same dataset as `tasks`, so group counts can never disagree with the rows.
    unassignedCount: canViewAllTasks(user) ? tasks.filter((t) => !t.assignedUserId).length : 0,
  });
});

apiRouter.post('/tasks', async (req: Request, res: Response) => {
  try {
    const task: Task = req.body;
    const saved = await centralDb.saveTask(task);
    res.json({ success: true, task: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.put('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const task: Task = { ...req.body, id: req.params.id };
    const saved = await centralDb.saveTask(task);
    res.json({ success: true, task: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await centralDb.deleteTask(req.params.id);
    res.json({ success: deleted, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// Contracts CRUD
// ----------------------------------------------------
apiRouter.get('/contracts', (req: Request, res: Response) => {
  res.json({ contracts: centralDb.getState().contracts });
});

apiRouter.post('/contracts', async (req: Request, res: Response) => {
  try {
    const contract: Contract = req.body;
    const saved = await centralDb.saveContract(contract);
    res.json({ success: true, contract: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.put('/contracts/:id', async (req: Request, res: Response) => {
  try {
    const contract: Contract = { ...req.body, id: req.params.id };
    const saved = await centralDb.saveContract(contract);
    res.json({ success: true, contract: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/contracts/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await centralDb.deleteContract(req.params.id);
    res.json({ success: deleted, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// Payments & Checks CRUD
// ----------------------------------------------------
apiRouter.get('/payments', (req: Request, res: Response) => {
  res.json({ payments: centralDb.getState().payments });
});

apiRouter.post('/payments', async (req: Request, res: Response) => {
  try {
    const payment: Payment = req.body;
    const saved = await centralDb.savePayment(payment);
    res.json({ success: true, payment: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.put('/payments/:id', async (req: Request, res: Response) => {
  try {
    const payment: Payment = { ...req.body, id: req.params.id };
    const saved = await centralDb.savePayment(payment);
    res.json({ success: true, payment: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/payments/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await centralDb.deletePayment(req.params.id);
    res.json({ success: deleted, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/checks', (req: Request, res: Response) => {
  res.json({ checks: centralDb.getState().checks });
});

apiRouter.post('/checks', async (req: Request, res: Response) => {
  try {
    const check: Check = req.body;
    const saved = await centralDb.saveCheck(check);
    res.json({ success: true, check: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.put('/checks/:id', async (req: Request, res: Response) => {
  try {
    const check: Check = { ...req.body, id: req.params.id };
    const saved = await centralDb.saveCheck(check);
    res.json({ success: true, check: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/checks/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await centralDb.deleteCheck(req.params.id);
    res.json({ success: deleted, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// SIM & Repairs CRUD
// ----------------------------------------------------
apiRouter.get('/sims', (req: Request, res: Response) => {
  res.json({ sims: centralDb.getState().sims });
});

apiRouter.post('/sims', async (req: Request, res: Response) => {
  try {
    const sim: SimCard = req.body;
    const user = getAuthUser(req);
    const rule = applyDeedTransferRule(sim, user);
    if (rule.error) {
      return res.status(400).json({ success: false, message: rule.error });
    }
    const saved = await centralDb.saveSim(rule.sim as SimCard);
    if (rule.auditOverride) await auditDeedOverride(user, rule.auditOverride, saved.id);
    res.json({
      success: true,
      sim: saved,
      ...deedPayload(saved),
      deedWarnings: rule.warnings,
      revision: centralDb.getRevisionInfo().revision,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.put('/sims/:id', async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const existing = centralDb.getState().sims.find((s) => s.id === req.params.id);
    // Merge over the stored record so a partial payload cannot silently drop
    // the dates the checks need to measure against.
    const rule = applyDeedTransferRule({ ...req.body, id: req.params.id }, user, existing);
    if (rule.error) {
      return res.status(400).json({ success: false, message: rule.error });
    }
    const saved = await centralDb.saveSim(rule.sim as SimCard);
    if (rule.auditOverride) await auditDeedOverride(user, rule.auditOverride, saved.id);
    res.json({
      success: true,
      sim: saved,
      ...deedPayload(saved),
      deedWarnings: rule.warnings,
      revision: centralDb.getRevisionInfo().revision,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/sims/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await centralDb.deleteSim(req.params.id);
    res.json({ success: deleted, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// SIM Financial Lifecycle / چرخه مالی سیم‌کارت
// ----------------------------------------------------
apiRouter.get('/sims/:id/purchases', (req: Request, res: Response) => {
  res.json({ purchases: centralDb.getSimPurchases(req.params.id) });
});

apiRouter.post('/sims/:id/purchases', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const purchase: SimPurchase = {
      ...req.body,
      simId: req.params.id,
      createdByUserId: authUser?.id,
      createdByUserName: authUser?.name,
    };
    const saved = await centralDb.createSimPurchase(purchase);
    centralDb.logAudit({
      userId: authUser?.id, userName: authUser?.name, userRole: authUser?.role,
      action: 'SIM_PURCHASE_CREATED', module: ModuleName.SIM_INVENTORY,
      entityType: 'SIM', entityName: saved.simId, targetId: saved.simId,
      details: `ثبت خرید سیم‌کارت به مبلغ ${saved.purchasePrice}`,
    });

    // The eligibility base is the PREVIOUS ownership transfer, captured here at
    // purchase time because the seller is the only one who knows it. The manual
    // follow-up due date is captured alongside it, straight from the operator —
    // it is their choice and is never derived from the purchase date.
    const simRow = centralDb.getState().sims.find((s) => s.id === saved.simId);

    res.json({
      success: true,
      purchase: saved,
      sim: simRow,
      ...(simRow ? deedPayload(simRow) : {}),
      revision: centralDb.getRevisionInfo().revision,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.put('/sim-purchases/:id', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const saved = await centralDb.saveSimPurchase(req.params.id, req.body);
    centralDb.logAudit({
      userId: authUser?.id, userName: authUser?.name, userRole: authUser?.role,
      action: 'SIM_PURCHASE_UPDATED', module: ModuleName.SIM_INVENTORY,
      entityType: 'SIM', entityName: saved.simId, targetId: saved.simId,
      details: 'ویرایش خرید سیم‌کارت',
    });
    res.json({ success: true, purchase: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/sim-purchases/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await centralDb.deleteSimPurchase(req.params.id);
    res.json({ success: deleted, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/sim-purchases/:id/payments', (req: Request, res: Response) => {
  res.json({ payments: centralDb.getPurchasePayments(req.params.id) });
});

apiRouter.post('/sim-purchases/:id/payments', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const payment: SimPurchasePayment = {
      ...req.body,
      purchaseId: req.params.id,
      createdByUserId: authUser?.id,
      createdByUserName: authUser?.name,
    };
    const overrideRefund = req.body.overrideRefund === true;
    const saved = await centralDb.addPurchasePayment(payment, { overrideRefund });
    const purchase = centralDb.getState().simPurchases?.find((p) => p.id === payment.purchaseId);
    centralDb.logAudit({
      userId: authUser?.id, userName: authUser?.name, userRole: authUser?.role,
      action: 'SIM_PURCHASE_PAYMENT_CREATED', module: ModuleName.SIM_INVENTORY,
      entityType: 'SIM', entityName: purchase?.simId, targetId: purchase?.simId,
      details: `پرداخت خرید سیم‌کارت به مبلغ ${saved.amount} (${saved.method})`,
    });
    res.json({ success: true, purchase, payment: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/sim-purchases/:id/return', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const returnData: SimPurchaseReturn = {
      ...req.body,
      purchaseId: req.params.id,
      createdByUserId: authUser?.id,
      createdByUserName: authUser?.name,
    };
    const saved = await centralDb.createPurchaseReturn(returnData, { overrideRefund: req.body.overrideRefund === true });
    centralDb.logAudit({
      userId: authUser?.id, userName: authUser?.name, userRole: authUser?.role,
      action: saved.isPartial ? 'SIM_PURCHASE_RETURN_CREATED' : 'SIM_PURCHASE_RETURN_CREATED',
      module: ModuleName.SIM_INVENTORY,
      entityType: 'SIM', entityName: saved.simId, targetId: saved.simId,
      details: `عودت خرید سیم‌کارت به مبلغ ${saved.returnAmount}`,
    });
    res.json({ success: true, purchase: centralDb.getState().simPurchases?.find((p) => p.id === saved.purchaseId), purchReturn: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/sims/:id/sale-payments', (req: Request, res: Response) => {
  res.json({ payments: centralDb.getSalePayments(req.params.id) });
});

apiRouter.post('/sims/:id/sale-payments', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const payment: SimSalePayment = {
      ...req.body,
      simId: req.params.id,
      createdByUserId: authUser?.id,
      createdByUserName: authUser?.name,
    };
    const saved = await centralDb.addSalePayment(payment);
    centralDb.logAudit({
      userId: authUser?.id, userName: authUser?.name, userRole: authUser?.role,
      action: 'SIM_SALE_PAYMENT_CREATED', module: ModuleName.SIM_INVENTORY,
      entityType: 'SIM', entityName: saved.simId, targetId: saved.simId,
      details: `دریافت فروش سیم‌کارت به مبلغ ${saved.amount} (${saved.method})`,
    });
    res.json({ success: true, payment: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/sims/:id/sale-return', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const returnData: SimSaleReturn = {
      ...req.body,
      simId: req.params.id,
      createdByUserId: authUser?.id,
      createdByUserName: authUser?.name,
    };
    const saved = await centralDb.createSaleReturn(returnData);
    centralDb.logAudit({
      userId: authUser?.id, userName: authUser?.name, userRole: authUser?.role,
      action: 'SIM_SALE_RETURN_CREATED', module: ModuleName.SIM_INVENTORY,
      entityType: 'SIM', entityName: saved.simId, targetId: saved.simId,
      details: `برگشت فروش سیم‌کارت به مبلغ ${saved.returnAmount}`,
    });
    res.json({ success: true, saleReturn: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/sims/:id/cost-items', (req: Request, res: Response) => {
  res.json({ items: centralDb.getSimCostItems(req.params.id) });
});

apiRouter.post('/sims/:id/cost-items', async (req: Request, res: Response) => {
  try {
    const item: SimCostItem = { ...req.body, simId: req.params.id };
    const saved = await centralDb.addSimCostItem(item);
    res.json({ success: true, item: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/sims/:id/financial', (req: Request, res: Response) => {
  try {
    const summary = centralDb.getSimFinancialSummary(req.params.id);
    res.json({ summary, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/sims/:id/financial-timeline', (req: Request, res: Response) => {
  try {
    const timeline = centralDb.getSimFinancialTimeline(req.params.id);
    res.json({ timeline, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/sims/:id/profitability', (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const summary = centralDb.getSimFinancialSummary(req.params.id);
    if (req.query.audit === '1') {
      centralDb.logAudit({
        userId: authUser?.id, userName: authUser?.name, userRole: authUser?.role,
        action: 'SIM_PROFIT_VIEWED', module: ModuleName.SIM_INVENTORY,
        entityType: 'SIM', entityName: req.params.id, targetId: req.params.id,
        details: 'مشاهده سودآوری سیم‌کارت',
      });
    }
    res.json({ summary, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// SIM Financial Lifecycle Routes
// ----------------------------------------------------
apiRouter.get('/sims/:id/purchases', (req: Request, res: Response) => {
  try {
    const purchases = centralDb.getSimPurchases(req.params.id);
    res.json({ purchases });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/sims/:id/purchases', async (req: Request, res: Response) => {
  try {
    const purchase = await centralDb.createSimPurchase({ ...req.body, simId: req.params.id });
    const user = getAuthUser(req);
    await centralDb.logAudit({
      userId: user?.id,
      userName: user?.name,
      userRole: user?.role,
      action: 'SIM_PURCHASE_CREATED',
      module: ModuleName.SIM_INVENTORY,
      entityType: 'SimPurchase',
      targetId: purchase.id,
      details: `خرید سیم‌کارت ${req.params.id} به مبلغ ${purchase.purchasePrice}`,
    });
    res.json({ success: true, purchase, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.patch('/sim-purchases/:id', async (req: Request, res: Response) => {
  try {
    const purchase = await centralDb.saveSimPurchase(req.params.id, req.body);
    const user = getAuthUser(req);
    await centralDb.logAudit({
      userId: user?.id,
      userName: user?.name,
      userRole: user?.role,
      action: 'SIM_PURCHASE_UPDATED',
      module: ModuleName.SIM_INVENTORY,
      entityType: 'SimPurchase',
      targetId: purchase.id,
      details: `ویرایش خرید سیم‌کارت ${purchase.id}`,
    });
    res.json({ success: true, purchase, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/sim-purchases/:id/payments', (req: Request, res: Response) => {
  try {
    const payments = centralDb.getPurchasePayments(req.params.id);
    res.json({ payments });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/sim-purchases/:id/payments', async (req: Request, res: Response) => {
  try {
    const payment = await centralDb.addPurchasePayment({ ...req.body, purchaseId: req.params.id }, { overrideRefund: Boolean((req as any).query?.overrideRefund) });
    const user = getAuthUser(req);
    await centralDb.logAudit({
      userId: user?.id,
      userName: user?.name,
      userRole: user?.role,
      action: 'SIM_PURCHASE_PAYMENT_CREATED',
      module: ModuleName.SIM_INVENTORY,
      entityType: 'SimPurchasePayment',
      targetId: payment.id,
      details: `پرداخت خرید ${payment.purchaseId} به مبلغ ${payment.amount}`,
    });
    res.json({ success: true, payment, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/sim-purchases/:id/return', async (req: Request, res: Response) => {
  try {
    const purchReturn = await centralDb.createPurchaseReturn({ ...req.body, purchaseId: req.params.id }, { overrideRefund: Boolean((req as any).query?.overrideRefund) });
    const user = getAuthUser(req);
    await centralDb.logAudit({
      userId: user?.id,
      userName: user?.name,
      userRole: user?.role,
      action: 'SIM_PURCHASE_RETURN_CREATED',
      module: ModuleName.SIM_INVENTORY,
      entityType: 'SimPurchaseReturn',
      targetId: purchReturn.id,
      details: `عودت خرید ${purchReturn.purchaseId} به مبلغ ${purchReturn.returnAmount}`,
    });
    res.json({ success: true, purchaseReturn: purchReturn, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/sims/:id/sale-payments', (req: Request, res: Response) => {
  try {
    const payments = centralDb.getSalePayments(req.params.id);
    res.json({ payments });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/sims/:id/sale-payments', async (req: Request, res: Response) => {
  try {
    const payment = await centralDb.addSalePayment({ ...req.body, simId: req.params.id });
    const user = getAuthUser(req);
    await centralDb.logAudit({
      userId: user?.id,
      userName: user?.name,
      userRole: user?.role,
      action: 'SIM_SALE_PAYMENT_CREATED',
      module: ModuleName.SIM_INVENTORY,
      entityType: 'SimSalePayment',
      targetId: payment.id,
      details: `دریافت فروش سیم‌کارت ${req.params.id} به مبلغ ${payment.amount}`,
    });
    res.json({ success: true, payment, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/sims/:id/sale-return', async (req: Request, res: Response) => {
  try {
    const saleReturn = await centralDb.createSaleReturn({ ...req.body, simId: req.params.id });
    const user = getAuthUser(req);
    await centralDb.logAudit({
      userId: user?.id,
      userName: user?.name,
      userRole: user?.role,
      action: 'SIM_SALE_RETURN_CREATED',
      module: ModuleName.SIM_INVENTORY,
      entityType: 'SimSaleReturn',
      targetId: saleReturn.id,
      details: `برگشت فروش سیم‌کارت ${req.params.id} به مبلغ ${saleReturn.returnAmount}`,
    });
    res.json({ success: true, saleReturn, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/sims/:id/cost-items', (req: Request, res: Response) => {
  try {
    const items = centralDb.getSimCostItems(req.params.id);
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/sims/:id/cost-items', async (req: Request, res: Response) => {
  try {
    const item = await centralDb.addSimCostItem({ ...req.body, simId: req.params.id });
    const user = getAuthUser(req);
    await centralDb.logAudit({
      userId: user?.id,
      userName: user?.name,
      userRole: user?.role,
      action: 'SIM_FINANCIAL_ADJUSTMENT_CREATED',
      module: ModuleName.SIM_INVENTORY,
      entityType: 'SimCostItem',
      targetId: item.id,
      details: `ثبت هزینه ${item.side}/${item.category} سیم‌کارت ${req.params.id} به مبلغ ${item.amount}`,
    });
    res.json({ success: true, item, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/sims/:id/financial', (req: Request, res: Response) => {
  try {
    const summary = centralDb.getSimFinancialSummary(req.params.id);
    res.json({ summary, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/sims/:id/financial-timeline', (req: Request, res: Response) => {
  try {
    const timeline = centralDb.getSimFinancialTimeline(req.params.id);
    res.json({ timeline, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/sims/:id/profitability', (req: Request, res: Response) => {
  try {
    const summary = centralDb.getSimFinancialSummary(req.params.id);
    const user = getAuthUser(req);
    if ((req.query as any)?.audit === '1') {
      centralDb.logAudit({
        userId: user?.id,
        userName: user?.name,
        userRole: user?.role,
        action: 'SIM_PROFIT_VIEWED',
        module: ModuleName.SIM_INVENTORY,
        entityType: 'SimCard',
        targetId: req.params.id,
        details: `مشاهده سود سیم‌کارت ${req.params.id}`,
      });
    }
    res.json({ summary, grossMargin: summary.grossMargin, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// Consignment SIM Lifecycle / چرخه مالی سیم‌کارت امانی (Sprint 04 Patch §4)
// ----------------------------------------------------
apiRouter.get('/consignments', (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  res.json({ success: true, consignments: consignmentDb.getConsignments(status) });
});

apiRouter.get('/consignments/:id', (req: Request, res: Response) => {
  const consignment = consignmentDb.findConsignmentById(req.params.id);
  if (!consignment) {
    return res.status(404).json({ success: false, message: 'سیم‌کارت امانی یافت نشد.' });
  }
  res.json({ success: true, consignment });
});

apiRouter.post('/consignments', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const consignment = await consignmentDb.createConsignment({ ...req.body, createdByUserId: authUser?.id, createdByUserName: authUser?.name });
    centralDb.logAudit({
      userId: authUser?.id, userName: authUser?.name, userRole: authUser?.role,
      action: 'CONSIGNMENT_CREATED', module: ModuleName.SIM_INVENTORY,
      entityType: 'Consignment', entityName: consignment.simPhoneNumber, targetId: consignment.id,
      details: `دریافت سیم‌کارت امانی ${consignment.simPhoneNumber} به قیمت پیشنهادی ${consignment.requestedPrice}`,
    });
    res.json({ success: true, consignment, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.put('/consignments/:id', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const saved = await consignmentDb.updateConsignment(req.params.id, req.body);
    centralDb.logAudit({
      userId: authUser?.id, userName: authUser?.name, userRole: authUser?.role,
      action: 'CONSIGNMENT_UPDATED', module: ModuleName.SIM_INVENTORY,
      entityType: 'Consignment', entityName: saved.simPhoneNumber, targetId: saved.id,
      details: 'ویرایش سیم‌کارت امانی',
    });
    res.json({ success: true, consignment: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/consignments/:id/sale', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const saved = await consignmentDb.recordConsignmentSale(req.params.id, { ...req.body, createdByUserId: authUser?.id, createdByUserName: authUser?.name });
    centralDb.logAudit({
      userId: authUser?.id, userName: authUser?.name, userRole: authUser?.role,
      action: 'CONSIGNMENT_SOLD', module: ModuleName.SIM_INVENTORY,
      entityType: 'Consignment', entityName: saved.simPhoneNumber, targetId: saved.id,
      details: `فروش سیم‌کارت امانی ${saved.simPhoneNumber} به مبلغ ${saved.soldPrice}، کمیسیون ${saved.actualCommission}`,
    });
    res.json({ success: true, consignment: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/consignments/:id/payments', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const saved = await consignmentDb.addConsignmentPayment(req.params.id, { ...req.body, createdByUserId: authUser?.id, createdByUserName: authUser?.name });
    centralDb.logAudit({
      userId: authUser?.id, userName: authUser?.name, userRole: authUser?.role,
      action: 'CONSIGNMENT_PAYMENT_CREATED', module: ModuleName.SIM_INVENTORY,
      entityType: 'Consignment', entityName: saved.consignment.simPhoneNumber, targetId: saved.consignment.id,
      details: `پرداخت فروش سیم‌کارت امانی به مبلغ ${saved.payment.amount} (${saved.payment.method})`,
    });
    res.json({ success: true, consignment: saved.consignment, payment: saved.payment, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/consignments/:id/return', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const saved = await consignmentDb.recordConsignmentReturn(req.params.id, { ...req.body, createdByUserId: authUser?.id, createdByUserName: authUser?.name });
    centralDb.logAudit({
      userId: authUser?.id, userName: authUser?.name, userRole: authUser?.role,
      action: 'CONSIGNMENT_RETURNED', module: ModuleName.SIM_INVENTORY,
      entityType: 'Consignment', entityName: saved.simPhoneNumber, targetId: saved.id,
      details: `برگشت سیم‌کارت امانی ${saved.simPhoneNumber}: ${saved.returnReason}`,
    });
    res.json({ success: true, consignment: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/consignments/:id/settle', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const saved = await consignmentDb.settleConsignmentOwner(req.params.id, { ...req.body, createdByUserId: authUser?.id, createdByUserName: authUser?.name });
    centralDb.logAudit({
      userId: authUser?.id, userName: authUser?.name, userRole: authUser?.role,
      action: 'CONSIGNMENT_SETTLED', module: ModuleName.SIM_INVENTORY,
      entityType: 'Consignment', entityName: saved.consignment.simPhoneNumber, targetId: saved.consignment.id,
      details: `تسویه حساب مالک سیم‌کارت امانی ${saved.consignment.simPhoneNumber} به مبلغ ${saved.payment.amount}`,
    });
    res.json({ success: true, consignment: saved.consignment, payment: saved.payment, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/consignments/:id/audit', (req: Request, res: Response) => {
  try {
    const logs = centralDb.getAuditLogs({ targetId: req.params.id, targetType: 'Consignment' });
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/repairs', (req: Request, res: Response) => {
  res.json({ repairs: centralDb.getState().repairs });
});

apiRouter.post('/repairs', async (req: Request, res: Response) => {
  try {
    const repair: Repair = req.body;
    const saved = await centralDb.saveRepair(repair);
    res.json({ success: true, repair: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.put('/repairs/:id', async (req: Request, res: Response) => {
  try {
    const repair: Repair = { ...req.body, id: req.params.id };
    const saved = await centralDb.saveRepair(repair);
    res.json({ success: true, repair: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/repairs/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await centralDb.deleteRepair(req.params.id);
    res.json({ success: deleted, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Helper to parse base64 dataUrl into binary buffer and determine exact MIME type
function parseAttachmentContent(dataUrl: string, fileName?: string, declaredMime?: string): { mimeType: string; buffer: Buffer } {
  let mimeType = declaredMime || 'application/octet-stream';
  let buffer: Buffer = Buffer.alloc(0);

  if (dataUrl && dataUrl.startsWith('data:')) {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx !== -1) {
      const headerPart = dataUrl.substring(5, commaIdx);
      const isBase64 = headerPart.includes(';base64');
      const rawType = headerPart.split(';')[0];
      if (rawType && rawType !== 'application/octet-stream') {
        mimeType = rawType;
      }
      const dataPayload = dataUrl.substring(commaIdx + 1);
      if (isBase64) {
        buffer = Buffer.from(dataPayload, 'base64');
      } else {
        buffer = Buffer.from(decodeURIComponent(dataPayload), 'utf-8');
      }
    }
  }

  // Refine MIME type if generic, missing, or JSON (browser sends wrong MIME for HEIC)
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
  if (!mimeType || mimeType === 'application/octet-stream' || mimeType === 'application/json') {
    if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg';
    else if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';
    else if (ext === 'gif') mimeType = 'image/gif';
    else if (ext === 'svg') mimeType = 'image/svg+xml';
    else if (ext === 'pdf') mimeType = 'application/pdf';
    else if (['txt', 'log'].includes(ext)) mimeType = 'text/plain; charset=utf-8';
    else if (ext === 'csv') mimeType = 'text/csv; charset=utf-8';
    else if (ext === 'json') mimeType = 'application/json';
    else if (['heic', 'heif'].includes(ext)) mimeType = 'image/heic';
    else if (['mp4', 'mov'].includes(ext)) mimeType = 'video/mp4';
    else if (ext === 'mp3') mimeType = 'audio/mpeg';
    else if (ext === 'm4a') mimeType = 'audio/mp4';
  }

  // Magic bytes sniffing for foolproof accuracy
  if (buffer.length >= 4) {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      mimeType = 'image/png';
    } else if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      mimeType = 'image/jpeg';
    } else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      mimeType = 'image/gif';
    } else if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      // RIFF check for WEBP
      if (buffer.length >= 12 && buffer.toString('ascii', 8, 12) === 'WEBP') {
        mimeType = 'image/webp';
      }
    } else if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      mimeType = 'application/pdf';
    }
  }

  return { mimeType, buffer };
}

// ----------------------------------------------------
// Attachments CRUD & Flexible Linking & Secure Content Streaming
// ----------------------------------------------------
apiRouter.get('/attachments', (req: Request, res: Response) => {
  res.json({ attachments: centralDb.getState().attachments });
});

apiRouter.get('/attachments/:id', (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
  }

  const att = centralDb.getState().attachments.find((a) => a.id === req.params.id);
  if (!att) {
    return res.status(404).json({ success: false, message: 'سند یافت نشد.' });
  }

  res.json({ success: true, attachment: att });
});

// Secure Attachment Content & Preview Endpoint (Streams binary with exact Content-Type)
apiRouter.get(['/attachments/:id/content', '/attachments/:id/preview'], (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: 'دسترسی غیرمجاز: احراز هویت الزامی است.' });
  }

  const att = centralDb.getState().attachments.find((a) => a.id === req.params.id);
  if (!att) {
    return res.status(404).json({ success: false, message: 'فایل پیوست یافت نشد.' });
  }

  if (!att.dataUrl) {
    return res.status(404).json({ success: false, message: 'محتوای فایل یافت نشد.' });
  }

  const { mimeType, buffer } = parseAttachmentContent(
    att.dataUrl,
    att.fileName || att.filename,
    att.mimeType || att.fileType
  );

  const isDownload = req.query.download === 'true' || req.query.download === '1';
  const fileName = att.fileName || att.filename || 'attachment';
  const encodedName = encodeURIComponent(fileName).replace(/['()]/g, escape);

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader(
    'Content-Disposition',
    `${isDownload ? 'attachment' : 'inline'}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`
  );

  return res.send(buffer);
});

const ALLOWED_UPLOAD_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif', 'bmp', 'tiff', 'tif', 'svg',
  'pdf', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'zip', 'mp3', 'mp4', 'm4a', 'ogg', 'webm', 'wav',
];
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

/** §8 File validation — server must validate independently of the client. */
function validateUploadAttachment(att: Attachment): { ok: boolean; reason?: string } {
  if (!att || typeof att !== 'object') return { ok: false, reason: 'body must be an object' };
  const fileName = att.fileName || att.originalName || '';
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext && !ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) {
    return { ok: false, reason: `پسوند فایل مجاز نیست: .${ext}` };
  }
  const size = Number(att.fileSize || att.sizeBytes || 0);
  if (size > MAX_UPLOAD_SIZE_BYTES) {
    return { ok: false, reason: `حجم فایل از سقف مجاز (${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)}MB) بیشتر است` };
  }
  // Base64 data URL vs declared size — don't accept a payload that disagrees with its own header.
  if (att.dataUrl && att.dataUrl.startsWith('data:') && !att.dataUrl.includes(';base64,')) {
    return { ok: false, reason: 'فرمت داده فایل نامعتبر است' };
  }
  return { ok: true };
}

/** §8 Safe filename — strip path separators & control chars to prevent path traversal. */
function sanitizeFileName(name: string): string {
  const cleaned = (name || '')
    .replace(/[\\/]+/g, '_')
    .replace(/[ -]/g, '')
    .trim();
  return cleaned.slice(0, 200) || 'document';
}

/** §9 Retry-safe, duplicate-free create-or-return by idempotencyKey / sha256. */
function dedupeAttachment(att: Attachment): Attachment | null {
  const state = centralDb.getState();
  const key = att.idempotencyKey || '';
  const sha = att.sha256 || '';
  if (!key && !sha) return null;
  return state.attachments.find((a) =>
    a.id !== att.id &&
    ((key && a.idempotencyKey === key) || (sha && a.sha256 === sha))
  ) || null;
}

apiRouter.post('/attachments', async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    }
    const att: Attachment = {
      ...(req.body || {}),
      fileName: sanitizeFileName((req.body?.fileName || req.body?.originalName || '') as string),
      uploadedByUserId: (req.body?.uploadedByUserId as string) || user.id,
      uploadedByUserName: (req.body?.uploadedByUserName as string) || user.name,
      uploadStatus: (req.body?.uploadStatus as Attachment['uploadStatus']) || 'RECEIVED',
    };

    const v = validateUploadAttachment(att);
    if (!v.ok) {
      return res.status(400).json({ success: false, message: v.reason });
    }

    const existing = dedupeAttachment(att);
    if (existing && !att.id) {
      return res.status(409).json({
        success: false,
        message: 'فایل از قبل بارگذاری شده است. از لیست اسناد انتخاب کنید.',
        existingId: existing.id,
      });
    }

    const saved = await centralDb.saveAttachment(att);
    await centralDb.logAudit({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'DOCUMENT_UPLOAD_COMPLETED',
      module: ModuleName.DOCUMENTS,
      entityType: 'ATTACHMENT',
      targetId: saved.id,
      targetType: 'attachment',
      details: `سند "${saved.fileName}" بارگذاری و در Document Engine ثبت شد`,
      ipAddress: req.ip,
    });
    res.json({ success: true, attachment: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.put('/attachments/:id', async (req: Request, res: Response) => {
  try {
    const att: Attachment = { ...req.body, id: req.params.id };
    const saved = await centralDb.saveAttachment(att);
    res.json({ success: true, attachment: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/attachments/:id/link-customer', async (req: Request, res: Response) => {
  try {
    const { customerId, customerName } = req.body;
    const saved = await centralDb.linkAttachmentCustomer(req.params.id, customerId, customerName);
    if (!saved) {
      return res.status(404).json({ success: false, message: 'سند یافت نشد' });
    }
    const authUser = getAuthUser(req);
    await centralDb.logAudit({
      userId: authUser?.id || 'system',
      userName: authUser?.name || 'کاربر سیستم',
      userRole: authUser?.role || UserRole.SUPER_ADMIN,
      action: customerId ? 'اتصال سند به مشتری' : 'حذف انتساب سند از مشتری',
      module: ModuleName.CUSTOMERS,
      targetId: req.params.id,
      targetType: 'ATTACHMENT',
      details: customerId
        ? `سند "${saved.fileName}" به پرونده مشتری "${customerName || customerId}" متصل گردید.`
        : `ارتباط سند "${saved.fileName}" با مشتری حذف شد و به فهرست اسناد بدون مشتری منتقل گشت.`,
      ipAddress: req.ip,
    });
    res.json({ success: true, attachment: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/attachments/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await centralDb.deleteAttachment(req.params.id);
    res.json({ success: deleted, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// Users & Roles Management
// ----------------------------------------------------
apiRouter.get('/users', (req: Request, res: Response) => {
  res.json({ users: centralDb.getState().users });
});

apiRouter.post('/users', async (req: Request, res: Response) => {
  try {
    const user: User = req.body;
    const saved = await centralDb.saveUser(user);
    res.json({ success: true, user: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req) || centralDb.findUserById('usr-admin');
    if (!isAdmin(authUser)) {
      return res.status(403).json({ success: false, message: 'تنها مدیران ارشد مجاز به ویرایش مشخصات کاربران هستند.' });
    }

    const existing = centralDb.findUserById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'کاربر مورد نظر یافت نشد.' });
    }

    const incoming = req.body || {};
    const passwordToSave = (incoming.password || incoming.newPassword)
      ? String(incoming.password || incoming.newPassword).trim()
      : existing.password;

    const user: User = {
      ...existing,
      ...incoming,
      id: req.params.id,
      password: passwordToSave,
    };

    const saved = await centralDb.saveUser(user);

    await centralDb.logAudit({
      userId: authUser?.id || 'usr-admin',
      userName: authUser?.name || 'مدیر سیستم',
      userRole: authUser?.role || UserRole.SUPER_ADMIN,
      action: 'ویرایش مشخصات کاربر',
      module: ModuleName.USERS,
      targetId: saved.id,
      targetType: 'USER',
      details: `مشخصات و دسترسی‌های کاربر "${saved.name}" (@${saved.username}) توسط ${authUser?.name || 'مدیر'} به‌روزرسانی شد.`,
      ipAddress: req.ip,
    });

    const { password: _, ...sanitized } = saved;
    res.json({ success: true, user: sanitized, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/users/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req) || centralDb.findUserById('usr-admin');
    if (!isAdmin(authUser)) {
      return res.status(403).json({
        success: false,
        message: 'تنها مدیران ارشد (Super Admin) و کاربر ارشد (God) مجاز به بازنشانی رمز عبور کاربران هستند.',
      });
    }

    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'کلمه عبور جدید باید حداقل ۳ کاراکتر باشد.',
      });
    }

    const targetUser = centralDb.findUserById(req.params.id) || centralDb.findUserByCredential(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'کاربر مورد نظر جهت تغییر رمز عبور یافت نشد.' });
    }

    const updated = await centralDb.resetUserPassword(targetUser.id, newPassword.trim());

    await centralDb.logAudit({
      userId: authUser?.id || 'usr-admin',
      userName: authUser?.name || 'مدیر سیستم',
      userRole: authUser?.role || UserRole.SUPER_ADMIN,
      action: 'بازنشانی کلمه عبور کاربر (Password Reset)',
      module: ModuleName.USERS,
      targetId: targetUser.id,
      targetType: 'USER',
      details: `کلمه عبور کاربر "${targetUser.name}" (@${targetUser.username}) با موفقیت بازنشانی شد.`,
      ipAddress: req.ip,
    });

    const { password: _, ...sanitized } = updated;
    res.json({
      success: true,
      message: `رمز عبور کاربر "${targetUser.name}" با موفقیت تغییر یافت.`,
      user: sanitized,
      revision: centralDb.getRevisionInfo().revision,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req) || centralDb.findUserById('usr-admin');
    if (!isAdmin(authUser)) {
      return res.status(403).json({
        success: false,
        message: 'تنها مدیران ارشد (Super Admin) و کاربر ارشد (God) مجاز به حذف حساب‌های کاربری هستند.',
      });
    }

    const targetId = req.params.id;
    const targetUser = centralDb.findUserById(targetId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'کاربر مورد نظر یافت نشد.' });
    }

    if (targetUser.id === 'usr-admin' || targetUser.username?.toLowerCase() === 'admin') {
      return res.status(400).json({
        success: false,
        message: 'حساب کاربری ریشه سامانه (@admin) غیرقابل حذف است.',
      });
    }

    if (authUser?.id === targetUser.id) {
      return res.status(400).json({
        success: false,
        message: 'امکان حذف حساب کاربری جاری خودتان وجود ندارد.',
      });
    }

    const deleted = await centralDb.deleteUser(targetId);

    if (deleted) {
      await centralDb.logAudit({
        userId: authUser?.id || 'usr-admin',
        userName: authUser?.name || 'مدیر سیستم',
        userRole: authUser?.role || UserRole.SUPER_ADMIN,
        action: 'حذف حساب کاربری (User Deletion)',
        module: ModuleName.USERS,
        targetId: targetUser.id,
        targetType: 'USER',
        details: `حساب کاربری "${targetUser.name}" (@${targetUser.username}) با نقش ${targetUser.role} توسط ${authUser?.name || 'مدیر'} حذف شد.`,
        ipAddress: req.ip,
      });
    }

    res.json({
      success: deleted,
      message: `حساب کاربری "${targetUser.name}" با موفقیت حذف گردید.`,
      revision: centralDb.getRevisionInfo().revision,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/roles', (req: Request, res: Response) => {
  res.json({ roles: centralDb.getState().roles });
});

apiRouter.put('/roles/:id', async (req: Request, res: Response) => {
  try {
    const role: Role = { ...req.body, id: req.params.id };
    const saved = await centralDb.saveRole(role);
    res.json({ success: true, role: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// Notifications, Devices & Web Push Engine
// ----------------------------------------------------
apiRouter.get('/notifications', (req: Request, res: Response) => {
  res.json({ notifications: centralDb.getState().notifications });
});

apiRouter.post('/notifications', async (req: Request, res: Response) => {
  try {
    const n: Notification = req.body;
    const saved = await centralDb.saveNotification(n);
    res.json({ success: true, notification: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/notifications/:id/snooze', async (req: Request, res: Response) => {
  try {
    const minutes = Number(req.body.minutes) || 15;
    const snoozed = await centralDb.snoozeNotification(req.params.id, minutes);
    if (!snoozed) {
      return res.status(404).json({ success: false, message: 'اعلان یافت نشد' });
    }
    res.json({ success: true, notification: snoozed, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/notifications/read-all', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    await centralDb.markAllNotificationsRead(userId);
    res.json({ success: true, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/notifications/vapid-public-key', (req: Request, res: Response) => {
  res.json({ success: true, publicKey: webPushService.getPublicKey() });
});

// The devices/test-push/deliveries endpoints below are scoped to the authenticated
// user. They previously accepted a caller-supplied userId (or none at all), which let
// anyone enumerate another account's push endpoints or fire test pushes at them —
// CORS is wide open, so that was reachable from any origin.
apiRouter.get('/notifications/devices', (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
  const devices = centralDb.getUserDevices(authUser.id);
  res.json({ success: true, devices });
});

apiRouter.post('/notifications/devices/register', async (req: Request, res: Response) => {
  try {
    const device: UserNotificationDevice = req.body;
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    // Never trust a body-supplied userId: a caller could otherwise register a push
    // endpoint against someone else's account.
    const enrichedDevice: UserNotificationDevice = {
      ...device,
      userId: authUser.id,
      userName: authUser.name || device.userName || 'کاربر سیستم',
    };
    const registered = await centralDb.registerDevice(enrichedDevice);
    res.json({ success: true, device: registered, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/notifications/devices/:id/toggle', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const existing = centralDb.getUserDevices(authUser.id).find((d) => d.id === req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'دستگاه یافت نشد.' });
    const { enabled } = req.body;
    const updated = await centralDb.updateDevice(req.params.id, { enabled: Boolean(enabled) });
    res.json({ success: true, device: updated, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/notifications/devices/:id', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const existing = centralDb.getUserDevices(authUser.id).find((d) => d.id === req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'دستگاه یافت نشد.' });
    const deleted = await centralDb.deleteDevice(req.params.id);
    res.json({ success: deleted, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/notifications/test-push', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    // Target is always the caller; an override used to allow pushing to any account.
    const targetUserId = authUser.id;
    const title = req.body.title || 'آزمایش اعلان هوشمند MMBA';
    const body = req.body.body || 'سیستم هشدار صوتی و اعلان دستگاه‌های متصل فعال و پایدار است.';
    const notif = await notificationScheduler.sendTestNotification(targetUserId, title, body);
    res.json({ success: true, notification: notif });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/notifications/deliveries', (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
  const notificationId = req.query.notificationId as string | undefined;
  // Scoped to the caller so delivery history cannot be read across accounts.
  const deliveries = centralDb.getDeliveries(notificationId, authUser.id);
  res.json({ success: true, deliveries });
});

apiRouter.get('/notifications/settings', (req: Request, res: Response) => {
  const settings = centralDb.getNotificationSettings();
  res.json({ success: true, settings });
});

apiRouter.put('/notifications/settings', async (req: Request, res: Response) => {
  try {
    const updated = await centralDb.updateNotificationSettings(req.body);
    res.json({ success: true, settings: updated, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/audit-logs', (req: Request, res: Response) => {
  res.json({ auditLogs: centralDb.getState().auditLogs });
});

apiRouter.post('/audit-logs', async (req: Request, res: Response) => {
  try {
    const log = await centralDb.logAudit({ ...req.body, ipAddress: req.ip });
    res.json({ success: true, log, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// Problem Reports & User Error Reporting
// ----------------------------------------------------
// Any authenticated user can submit a problem report
apiRouter.post('/problem-reports', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const body: ProblemReport = req.body;
    const report: ProblemReport = {
      ...body,
      userId: body.userId || authUser?.id || 'anonymous',
      userName: body.userName || authUser?.name || 'کاربر سیستم',
      userRole: body.userRole || authUser?.role || UserRole.SALES,
      userEmail: body.userEmail || authUser?.email,
      userMobile: body.userMobile || authUser?.mobile,
      createdAt: body.createdAt || new Date().toISOString(),
    };

    const saved = await centralDb.saveProblemReport(report);

    // Notify administrators
    const admins = centralDb.getState().users.filter((u) => isAdmin(u));
    for (const adm of admins) {
      await centralDb.saveNotification({
        id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        userId: adm.id,
        title: 'گزارش خطای جدید توسط کاربر',
        message: `${saved.userName} یک مشکل جدید ثبت نمود: «${saved.title}»`,
        category: 'SYSTEM',
        severity: 'WARNING',
        read: false,
        relatedEntityType: 'PROBLEM_REPORT',
        relatedEntityId: saved.id,
        createdAt: new Date().toISOString(),
      });
    }

    res.json({ success: true, report: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin ONLY can view all problem reports
apiRouter.get('/problem-reports', (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  // If user is not admin, return only their own reports or 403
  if (authUser && !isAdmin(authUser)) {
    const userReports = centralDb.getState().problemReports.filter((r) => r.userId === authUser.id);
    return res.json({ reports: userReports });
  }
  res.json({ reports: centralDb.getState().problemReports });
});

// Admin ONLY can update or resolve problem reports
apiRouter.put('/problem-reports/:id', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const report: ProblemReport = { ...req.body, id: req.params.id };
    if (authUser && !isAdmin(authUser) && report.userId !== authUser.id) {
      return res.status(403).json({ success: false, message: 'تنها مدیران سیستم مجاز به تغییر وضعیت گزارش هستند.' });
    }
    const saved = await centralDb.saveProblemReport(report);
    res.json({ success: true, report: saved, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin ONLY can delete problem reports
apiRouter.delete('/problem-reports/:id', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (authUser && !isAdmin(authUser)) {
      return res.status(403).json({ success: false, message: 'تنها مدیران سیستم مجاز به حذف گزارشات هستند.' });
    }
    const deleted = await centralDb.deleteProblemReport(req.params.id);
    res.json({ success: deleted, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// Settings
// ----------------------------------------------------
apiRouter.get('/settings', (req: Request, res: Response) => {
  res.json({ settings: centralDb.getState().settings });
});

apiRouter.put('/settings', async (req: Request, res: Response) => {
  try {
    const updated = await centralDb.updateSettings(req.body);
    res.json({ success: true, settings: updated, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// WordPress Sync Proxy Endpoints (CORS Bypass)
// ----------------------------------------------------
apiRouter.get('/wordpress/health', async (req: Request, res: Response) => {
  const s = centralDb.getWordpressSyncSettings();
  if (!s?.apiUrl) return res.status(400).json({ success: false, message: 'آدرس وردپرس تنظیم نشده است.' });
  try {
    const upstream = await fetch(`${s.apiUrl.replace(/\/+$/, '')}/health`, { method: 'GET' });
    const data = await upstream.json().catch(() => ({}));
    res.json({ status: upstream.status, data });
  } catch (err: any) {
    res.status(502).json({ success: false, message: 'عدم دسترسی به وب‌سایت. اتصال اینترنت یا آدرس را بررسی کنید.' });
  }
});

apiRouter.get('/wordpress/sims', async (req: Request, res: Response) => {
  const s = centralDb.getWordpressSyncSettings();
  if (!s?.apiUrl) return res.status(400).json({ success: false, message: 'آدرس وردپرس تنظیم نشده است.' });
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    for (const h of ['x-avalsim-signature', 'x-avalsim-timestamp', 'x-avalsim-nonce']) {
      const v = req.header(h);
      if (v) headers[h] = v;
    }
    const upstream = await fetch(`${s.apiUrl.replace(/\/+$/, '')}/sims`, { method: 'GET', headers });
    const data = await upstream.json().catch(() => ({}));
    res.json({ status: upstream.status, data });
  } catch (err: any) {
    res.status(502).json({ success: false, message: 'عدم دسترسی به وب‌سایت.' });
  }
});

apiRouter.post('/wordpress/sims', async (req: Request, res: Response) => {
  const s = centralDb.getWordpressSyncSettings();
  if (!s?.apiUrl) return res.status(400).json({ success: false, message: 'آدرس وردپرس تنظیم نشده است.' });
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    for (const h of ['x-avalsim-signature', 'x-avalsim-timestamp', 'x-avalsim-nonce']) {
      const v = req.header(h);
      if (v) headers[h] = v;
    }
    const upstream = await fetch(`${s.apiUrl.replace(/\/+$/, '')}/sims`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json().catch(() => ({}));
    res.json({ status: upstream.status, data });
  } catch (err: any) {
    res.status(502).json({ success: false, message: 'عدم دسترسی به وب‌سایت.' });
  }
});

apiRouter.put('/wordpress/settings', async (req: Request, res: Response) => {
  try {
    const updated = await centralDb.saveWordpressSyncSettings(req.body);
    res.json({ success: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// Enterprise Backup & Restore Endpoints (RBAC Enforced)
// ----------------------------------------------------

// 1. List all backups
apiRouter.get('/backups', (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (authUser && !isAdmin(authUser)) {
      return res.status(403).json({ success: false, message: 'تنها مدیران ارشد سیستم مجاز به دسترسی به پشتیبان‌ها هستند.' });
    }
    const backups = backupService.listBackups();
    res.json({ success: true, backups });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Health & Diagnostics Summary
apiRouter.get('/backups/health', (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    // PONEYTAIL: isAdmin() should ideally already cover GOD, checking isGod() explicitly to ensure access
    if (authUser && !isAdmin(authUser) && !isGod(authUser)) {
      return res.status(403).json({ success: false, message: 'تنها مدیران ارشد سیستم مجاز به دسترسی به گزارش سلامت بکاپ هستند.' });
    }
    const health = backupService.getHealthSummary();
    res.json({ success: true, health });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Automatic Backup Schedule Settings
apiRouter.get('/backups/schedule', (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (authUser && !isAdmin(authUser) && !isGod(authUser)) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز.' });
    }
    const schedule = backupService.getScheduleSettings();
    res.json({ success: true, schedule });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.put('/backups/schedule', (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (authUser && !isAdmin(authUser)) {
      return res.status(403).json({ success: false, message: 'تنها مدیران سیستم مجاز به تغییر زمان‌بندی پشتیبان‌گیری هستند.' });
    }
    const updated = backupService.updateScheduleSettings(req.body);
    res.json({ success: true, schedule: updated, message: 'تنظیمات زمان‌بندی پشتیبان‌گیری خودکار با موفقیت ذخیره شد.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Create Full Backup Manually
apiRouter.post('/backups/create', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req) || centralDb.findUserById('usr-admin');
    if (authUser && !isAdmin(authUser) && !isGod(authUser)) {
      return res.status(403).json({ success: false, message: 'تنها مدیران ارشد سیستم مجاز به تولید بکاپ هستند.' });
    }

    const { notes } = req.body || {};
    const meta = await backupService.createFullBackup({
      type: BackupType.MANUAL,
      operator: authUser,
      notes,
    });

    res.status(201).json({
      success: true,
      backup: meta,
      message: `پشتیبان جامع سیستم "${meta.filename}" با حجم ${meta.sizeFormatted} با موفقیت ایجاد شد.`,
    });
  } catch (err: any) {
    console.error('Backup creation endpoint error:', err);
    res.status(500).json({ success: false, message: err.message || 'خطا در ایجاد فایل پشتیبان' });
  }
});

// 5. Verify Backup Integrity
apiRouter.get('/backups/:id/verify', (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (authUser && !isAdmin(authUser)) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز.' });
    }

    const pkg = backupService.getBackupPackage(req.params.id);
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'فایل پشتیبان مورد نظر یافت نشد.' });
    }

    const result = backupService.verifyBackupPackage(pkg);
    res.json({ success: true, verification: result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Download Full Backup Package (Protected Endpoint)
apiRouter.get('/backups/:id/download', (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (authUser && !isAdmin(authUser)) {
      return res.status(403).json({ success: false, message: 'تنها مدیران ارشد سیستم مجاز به دانلود فایل پشتیبان هستند.' });
    }

    const backupInfo = backupService.getBackupById(req.params.id);
    if (!backupInfo) {
      return res.status(404).json({ success: false, message: 'فایل پشتیبان یافت نشد.' });
    }

    const pkg = backupService.getBackupPackage(req.params.id);
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'بسته فایل پشتیبان قابل خواندن نیست.' });
    }

    const filename = backupInfo.meta.filename;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(pkg, null, 2));
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Delete Backup File
apiRouter.delete('/backups/:id', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (authUser && !isAdmin(authUser)) {
      return res.status(403).json({ success: false, message: 'تنها مدیران ارشد سیستم مجاز به حذف پشتیبان هستند.' });
    }

    const deleted = await backupService.deleteBackup(req.params.id, authUser);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'فایل پشتیبان یافت نشد یا حذف ناموفق بود.' });
    }

    res.json({ success: true, message: 'فایل پشتیبان با موفقیت از سرور حذف شد.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Restore System from Backup
apiRouter.post('/backups/:id/restore', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req) || centralDb.findUserById('usr-admin');
    if (!authUser || !isAdmin(authUser)) {
      return res.status(403).json({ success: false, message: 'تنها مدیران ارشد دارای صلاحیت مجاز به بازگردانی سیستم هستند.' });
    }

    const { confirmPhrase } = req.body || {};
    if (confirmPhrase !== 'RESTORE_CONFIRMED' && confirmPhrase !== 'RESTORE_MMBA') {
      return res.status(400).json({
        success: false,
        message: 'جهت جلوگیری از خطای ناخواسته، تاییدیه امنیتی معتبر الزامی است.',
      });
    }

    const result = await backupService.restoreBackup(req.params.id, authUser);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        result,
        message: result.message,
      });
    }

    res.json({
      success: true,
      result,
      message: result.message,
    });
  } catch (err: any) {
    console.error('Restore endpoint error:', err);
    res.status(500).json({ success: false, message: err.message || 'خطا در عملیات بازگردانی سیستم' });
  }
});

// 8. Upload Full System Backup Package
apiRouter.post('/backups/upload', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req) || centralDb.findUserById('usr-admin');
    if (!isAdmin(authUser)) {
      return res.status(403).json({ success: false, message: 'تنها مدیران ارشد مجاز به آپلود بسته پشتیبان هستند.' });
    }

    const packageData = req.body;
    if (!packageData || !packageData.database) {
      return res.status(400).json({ success: false, message: 'فایل ارسالی فاقد ساختار پایگاه داده است.' });
    }

    const savedBackup = await backupService.saveUploadedBackupPackage(packageData, authUser);
    res.json({
      success: true,
      message: `بسته پشتیبان "${savedBackup.filename}" با موفقیت دریافت و ثبت گردید.`,
      backup: savedBackup,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || 'خطا در آپلود بسته پشتیبان' });
  }
});

// 9. Legacy / Simple JSON Export & Import (Backward Compatibility)
apiRouter.get('/backup/export', (req: Request, res: Response) => {
  const state = centralDb.getState();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=mmba_backup_${Date.now()}.json`);
  res.send(JSON.stringify(state, null, 2));
});

apiRouter.post('/backup/import', async (req: Request, res: Response) => {
  try {
    const imported = await centralDb.importFullDatabase(req.body);
    res.json({ success: true, revision: imported.revision, message: 'بانک اطلاعاتی با موفقیت بازیابی شد.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// 10. MMBA Accounting Foundation Endpoints
// ----------------------------------------------------
apiRouter.get('/accounts', (req: Request, res: Response) => {
  try {
    const accounts = centralDb.getAccounts();
    res.json(accounts);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/accounts', async (req: Request, res: Response) => {
  try {
    const saved = await centralDb.saveAccount(req.body);
    res.json(saved);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await centralDb.deleteAccount(req.params.id);
    res.json({ success: deleted });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.get('/journal-entries', (req: Request, res: Response) => {
  try {
    const entries = centralDb.getJournalEntries();
    res.json(entries);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/journal-entries/:id', (req: Request, res: Response) => {
  try {
    const entry = centralDb.findJournalEntryById(req.params.id);
    if (!entry) return res.status(404).json({ success: false, message: 'سند حسابداری یافت نشد.' });
    res.json(entry);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/journal-entries', async (req: Request, res: Response) => {
  try {
    const { entry, lines } = req.body;
    const authUser = getAuthUser(req) || centralDb.findUserById('usr-admin');
    const entryData = {
      ...(entry || req.body),
      created_by: authUser?.id || 'usr-admin',
      created_by_name: authUser?.name || 'مدیر سیستم',
    };
    const linesData = lines || req.body.lines || [];
    const saved = await centralDb.saveJournalEntry(entryData, linesData);
    res.json(saved);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.get('/accounting-periods', (req: Request, res: Response) => {
  try {
    const periods = centralDb.getAccountingPeriods();
    res.json(periods);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/accounting-periods', async (req: Request, res: Response) => {
  try {
    const saved = await centralDb.saveAccountingPeriod(req.body);
    res.json(saved);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// 11. Internal Document Sharing & Assignment Endpoints
// ----------------------------------------------------
apiRouter.get('/document-shares', (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req) || centralDb.findUserById('usr-admin');
    const { userId, limit, offset, status, onlyUnread } = req.query;
    let shares = centralDb.getDocumentShares();
    const targetId = String(userId || '') || authUser?.id || 'usr-admin';
    shares = shares.filter((s) => (s.recipient_user_id === targetId || s.recipientUserId === targetId));
    if (onlyUnread === 'true') shares = shares.filter((s) => String(s.status) === 'SENT');
    if (status) shares = shares.filter((s) => String(s.status) === String(status));
    shares.sort((a, b) => new Date(b.shared_at || b.sharedAt).getTime() - new Date(a.shared_at || a.sharedAt).getTime());
    const total = shares.length;
    const start = Math.min(parseInt(String(offset || '0'), 10) || 0, total);
    const lim = limit ? parseInt(String(limit), 10) || 25 : total;
    const end = Math.min(start + lim, total);
    const page = shares.slice(start, end);
    res.json({ success: true, shares: page, total, limit: lim, offset: start });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/document-shares', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req) || centralDb.findUserById('usr-admin');
    const { documentId, recipientUsers, message, customerId, customerName, documentFileName, documentFileSize, documentFileType } = req.body;

    if (!documentId) {
      return res.status(400).json({ success: false, message: 'شناسه سند الزامی است.' });
    }
    if (!recipientUsers || !Array.isArray(recipientUsers) || recipientUsers.length === 0) {
      return res.status(400).json({ success: false, message: 'حداقل یک گیرنده سازمانی باید انتخاب شود.' });
    }

    const shares = await centralDb.createDocumentShares({
      documentId,
      senderUser: { id: authUser?.id || 'usr-admin', name: authUser?.name || 'مدیر سیستم' },
      recipientUsers,
      message,
      customerId,
      customerName,
      documentFileName,
      documentFileSize,
      documentFileType,
    });

    res.json({ success: true, shares });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.put('/document-shares/:id/read', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req) || centralDb.findUserById('usr-admin');
    const updated = await centralDb.markDocumentShareRead(req.params.id, authUser?.id || '');
    res.json({ success: true, share: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.put('/document-shares/:id/archive', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req) || centralDb.findUserById('usr-admin');
    const updated = await centralDb.archiveDocumentShare(req.params.id, authUser?.id || '');
    res.json({ success: true, share: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// 11b. Internal Chat Endpoints (Sprint 03 Patch 05)
// ----------------------------------------------------
function isConversationMember(userId: string, conversation: any, userRole?: string): boolean {
  if (!conversation) return false;
  if ((conversation.member_ids || []).includes(userId)) return true;
  const adminRoles = [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.GOD, 'ADMIN'];
  if (userRole && adminRoles.includes(userRole as any)) return true;
  return false;
}

apiRouter.get('/conversations', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const result = centralDb.getConversationsForUser(authUser.id);
    res.json({ success: true, conversations: result.conversations, unreadCount: result.unreadCount });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin endpoint: List all conversations across the organization with stats
apiRouter.get('/conversations/admin', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const adminRoles = [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.GOD, 'ADMIN'];
    const isAdmin = adminRoles.includes(authUser.role as any);
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'فقط مدیران سیستم به پنل نظارت پیام‌ها دسترسی دارند.' });
    }

    const { search, type, priority, archived } = req.query;
    const conversations = centralDb.getAllConversationsForAdmin({
      search: search ? String(search) : undefined,
      type: type ? String(type) : undefined,
      priority: priority ? String(priority) : undefined,
      archived: archived !== undefined ? archived === 'true' : undefined,
    });

    res.json({ success: true, conversations, count: conversations.length });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/conversations', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const { recipientUserId, recipientUserName } = req.body;
    if (!recipientUserId) return res.status(400).json({ success: false, message: 'کاربر گیرنده الزامی است.' });
    const recipient = centralDb.findUserById(recipientUserId);
    const conversation = await centralDb.getOrCreateDirectConversation(
      authUser.id, recipientUserId,
      authUser.name, recipient?.name || recipientUserName || 'کاربر'
    );
    await centralDb.logAudit({
      userId: authUser.id, userName: authUser.name, userRole: authUser.role,
      action: 'ایجاد گفتگوی داخلی', module: ModuleName.CHAT, entityType: 'CONVERSATION',
      targetId: conversation.id,
      details: `ایجاد گفتگوی مستقیم بین ${authUser.name} و ${recipient?.name || recipientUserName || ''}`,
    });
    res.json({ success: true, conversation });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Stage 2: Create Group Conversation
apiRouter.post('/conversations/group', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const { title, memberIds, groupImageUrl, priority } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'عنوان گروه الزامی است.' });
    }
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ success: false, message: 'انتخاب حداقل یک عضو برای گروه الزامی است.' });
    }

    const conversation = await centralDb.createGroupConversation(
      authUser.id,
      authUser.name,
      title.trim(),
      memberIds,
      groupImageUrl,
      priority
    );

    // Notify added members
    const now = new Date().toISOString();
    memberIds.forEach((mid: string) => {
      if (mid === authUser.id) return;
      centralDb.saveNotification({
        id: `notif-grp-${Date.now()}-${mid}`,
        userId: mid,
        title: 'عضویت در گروه گفتگو',
        message: `شما به گروه "${title}" توسط ${authUser.name} اضافه شدید.`,
        category: 'SYSTEM',
        severity: 'INFO',
        read: false,
        createdAt: now,
        relatedEntityType: 'CHAT',
        relatedEntityId: conversation.id,
      }).catch(() => {});
    });

    await centralDb.logAudit({
      userId: authUser.id, userName: authUser.name, userRole: authUser.role,
      action: 'ایجاد گروه گفتگوی تیمی', module: ModuleName.CHAT, entityType: 'CONVERSATION',
      targetId: conversation.id,
      details: `ایجاد گروه "${title}" با ${memberIds.length + 1} عضو`,
    });

    res.json({ success: true, conversation });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Stage 2: Add member to group
apiRouter.post('/conversations/:id/members', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const conversation = centralDb.getConversationById(req.params.id);
    if (!conversation) return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
    if (!isConversationMember(authUser.id, conversation, authUser.role)) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز.' });
    }

    const { userId, role } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'شناسه کاربر الزامی است.' });
    const targetUser = centralDb.findUserById(userId);
    const updated = await centralDb.addGroupMember(
      req.params.id,
      userId,
      targetUser?.name || 'کاربر جدید',
      role || 'MEMBER'
    );

    await centralDb.logAudit({
      userId: authUser.id, userName: authUser.name, userRole: authUser.role,
      action: 'افزودن عضو به گروه گفتگو', module: ModuleName.CHAT, entityType: 'CONVERSATION',
      targetId: req.params.id,
      details: `افزودن ${targetUser?.name || userId} به گفتگو توسط ${authUser.name}`,
    });

    res.json({ success: true, conversation: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Stage 2: Remove member from group
apiRouter.delete('/conversations/:id/members/:userId', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const conversation = centralDb.getConversationById(req.params.id);
    if (!conversation) return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
    if (!isConversationMember(authUser.id, conversation, authUser.role)) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز.' });
    }

    const updated = await centralDb.removeGroupMember(req.params.id, req.params.userId);
    res.json({ success: true, conversation: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Stage 1 & 2: Update Conversation (Priority, Name, Description)
apiRouter.patch('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const conversation = centralDb.getConversationById(req.params.id);
    if (!conversation) return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
    if (!isConversationMember(authUser.id, conversation, authUser.role)) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز.' });
    }

    const updated = await centralDb.updateConversation(req.params.id, req.body);
    res.json({ success: true, conversation: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Stage 1: Pin / Unpin Conversation
apiRouter.post('/conversations/:id/pin', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const conversation = centralDb.getConversationById(req.params.id);
    if (!conversation) return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });

    const updated = await centralDb.toggleConversationPin(req.params.id, authUser.id);
    res.json({ success: true, conversation: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Stage 1: Set Conversation Priority
apiRouter.post('/conversations/:id/priority', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const conversation = centralDb.getConversationById(req.params.id);
    if (!conversation) return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });

    const { priority } = req.body;
    const updated = await centralDb.setConversationPriority(req.params.id, priority);
    res.json({ success: true, conversation: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Super Admin: Delete conversation
apiRouter.delete('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const adminRoles = [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.GOD, 'ADMIN'];
    if (!adminRoles.includes(authUser.role as any)) {
      return res.status(403).json({ success: false, message: 'فقط مدیران ارشد مجاز به حذف گفتگو هستند.' });
    }

    const deleted = await centralDb.deleteConversationBySuperAdmin(req.params.id);
    await centralDb.logAudit({
      userId: authUser.id, userName: authUser.name, userRole: authUser.role,
      action: 'حذف کامل گفتگو توسط مدیر', module: ModuleName.CHAT, entityType: 'CONVERSATION',
      targetId: req.params.id, details: `حذف گفتگو ${req.params.id}`,
    });

    res.json({ success: deleted });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/conversations/:id/messages', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const conversation = centralDb.getConversationById(req.params.id);
    if (!conversation) return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
    if (!isConversationMember(authUser.id, conversation, authUser.role)) return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز به گفتگو.' });
    const before = req.query.before as string | undefined;
    const limitNum = req.query.limit ? parseInt(String(req.query.limit), 10) || 50 : 50;
    let messages = centralDb.getChatMessagesByConversation(req.params.id);
    if (before) {
      const bi = messages.findIndex((m) => m.id === before);
      if (bi >= 0) messages = messages.slice(0, bi);
    }
    const page = messages.slice(Math.max(0, messages.length - limitNum));
    res.json({ success: true, messages: page, total: messages.length });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/conversations/:id/messages', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const conversation = centralDb.getConversationById(req.params.id);
    if (!conversation) return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
    if (!isConversationMember(authUser.id, conversation, authUser.role)) return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز به گفتگو.' });
    const body = { ...(req.body || {}), conversation_id: req.params.id, conversationId: req.params.id, sender_user_id: authUser.id, senderUserId: authUser.id, sender_user_name: authUser.name, senderUserName: authUser.name };
    const message = await centralDb.sendChatMessage(body);

    // Live delivery to anyone watching this conversation through SSE.
    publishChat(conversation.id, 'message', authUser.id, authUser.name, { message });

    // Offline/backgrounded recipients: in-app record + web push through the
    // existing scheduler, which already honours quiet hours and prunes 410s.
    notifyChatRecipients(conversation, authUser, body.body || '', message.id);
    await centralDb.logAudit({
      userId: authUser.id, userName: authUser.name, userRole: authUser.role,
      action: 'ارسال پیام داخلی', module: ModuleName.CHAT, entityType: 'CHAT_MESSAGE',
      targetId: message.id, details: `پیام در گفتگو ${conversation.id}`, targetType: 'CHAT',
    });
    res.json({ success: true, message, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Stage 1: Soft Delete Message (with Deletion Reason & Audit)
apiRouter.delete('/conversations/:id/messages/:messageId', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const conversation = centralDb.getConversationById(req.params.id);
    if (!conversation) return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
    if (!isConversationMember(authUser.id, conversation, authUser.role)) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز.' });
    }

    const { reason } = req.body || {};
    const updated = await centralDb.softDeleteChatMessage(
      req.params.messageId,
      authUser.id,
      authUser.name,
      reason
    );
    if (!updated) return res.status(404).json({ success: false, message: 'پیام یافت نشد' });

    publishChat(req.params.id, 'deleted', authUser.id, authUser.name, { messageId: req.params.messageId, reason: reason || undefined });

    await centralDb.logAudit({
      userId: authUser.id, userName: authUser.name, userRole: authUser.role,
      action: 'حذف پیام گفتگو (Soft Delete)', module: ModuleName.CHAT, entityType: 'CHAT_MESSAGE',
      targetId: req.params.messageId, details: `دلیل: ${reason || 'ثبت نشده'}`,
    });

    res.json({ success: true, message: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Stage 1: Edit Message
apiRouter.put('/conversations/:id/messages/:messageId', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ success: false, message: 'متن پیام الزامی است.' });

    const conversation = centralDb.getConversationById(req.params.id);
    if (!conversation) return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
    if (!isConversationMember(authUser.id, conversation, authUser.role)) return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز به گفتگو.' });

    const updated = await centralDb.editChatMessage(req.params.messageId, authUser.id, body.trim());
    if (!updated) return res.status(403).json({ success: false, message: 'امکان ویرایش این پیام وجود ندارد.' });

    publishChat(req.params.id, 'edited', authUser.id, authUser.name, { message: updated });
    res.json({ success: true, message: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Toggle Emoji Reaction on Chat Message
apiRouter.post('/conversations/:id/messages/:messageId/reactions', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const conversation = centralDb.getConversationById(req.params.id);
    if (!conversation) return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
    if (!isConversationMember(authUser.id, conversation, authUser.role)) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز.' });
    }

    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ success: false, message: 'ایموجی الزامی است.' });

    const updated = await centralDb.toggleChatMessageReaction(
      req.params.messageId,
      authUser.id,
      authUser.name,
      emoji
    );
    if (!updated) return res.status(404).json({ success: false, message: 'پیام یافت نشد.' });

    publishChat(req.params.id, 'reaction', authUser.id, authUser.name, { message: updated, emoji });
    res.json({ success: true, message: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Stage 2: Link Document Engine Attachment to Message
apiRouter.post('/conversations/:id/messages/:messageId/attachments', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const { documentId } = req.body;
    if (!documentId) return res.status(400).json({ success: false, message: 'شناسه سند الزامی است.' });

    const att = await centralDb.attachDocumentToMessage(req.params.messageId, documentId);
    if (!att) return res.status(404).json({ success: false, message: 'پیام یا سند یافت نشد.' });

    res.json({ success: true, attachment: att });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.put('/conversations/:id/read', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const conversation = await centralDb.markChatConversationRead(req.params.id, authUser.id);
    if (!conversation) return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
    publishChat(req.params.id, 'read', authUser.id, authUser.name, { conversationId: req.params.id });
    res.json({ success: true, conversation, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.put('/conversations/:id/archive', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const conversation = await centralDb.archiveConversation(req.params.id, authUser.id);
    if (!conversation) return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
    res.json({ success: true, conversation, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Typing indicator — piggybacks on the 3.5s sync rather than a socket.
apiRouter.post('/conversations/:id/typing', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const conversation = centralDb.getConversationById(req.params.id);
    if (!conversation) return res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
    if (!isConversationMember(authUser.id, conversation, authUser.role)) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز.' });
    }
    const isTyping = req.body?.isTyping !== false;
    const updated = await centralDb.setConversationTyping(req.params.id, authUser.id, isTyping);
    publishChat(req.params.id, 'typing', authUser.id, authUser.name, { isTyping });
    res.json({ success: true, conversation: updated, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// SSE stream for live chat — replaces the 3.5s revision poll for the open thread.
//
// Plain HTTP/1.1 text/event-stream, authenticated through the same Authorization
// header every REST call uses (so the token never lands in a URL/query log, unlike
// a WebSocket that would need the token in a query param). The browser
// EventSource API cannot send custom headers, so the client uses fetch() +
// ReadableStream instead — see src/services/chatStream.ts.
//
// Emits one event per mutation the open thread cares about. The client decides
// whether to apply it: events for other conversations are ignored locally, and
// the OS-level push path (notificationScheduler) covers the backgrounded/offline
// case that SSE cannot reach.
apiRouter.get('/conversations/:id/stream', (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  if (!authUser) {
    res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    return;
  }
  const conversation = centralDb.getConversationById(req.params.id);
  if (!conversation) {
    res.status(404).json({ success: false, message: 'گفتگو یافت نشد' });
    return;
  }
  if (!isConversationMember(authUser.id, conversation, authUser.role)) {
    res.status(403).json({ success: false, message: 'دسترسی غیرمجاز به گفتگو.' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx must not buffer the stream
  });

  let alive = true;
  const send = (event: string, data: unknown) => {
    if (!alive) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      alive = false;
    }
  };

  // Initial snapshot so the client does not need a separate GET /messages.
  const seed = centralDb.getChatMessagesByConversation(req.params.id);
  send('snapshot', { conversationId: conversation.id, messages: seed, revision: centralDb.getRevisionInfo().revision });

  const revision = () => centralDb.getRevisionInfo().revision;

  // Live events for this conversation only.
  const off = eventBus.subscribe(req.params.id, (event: ChatEvent) => {
    // Never echo the sender's own action back to them — the client already has
    // the optimistic local state, and a duplicate would desync it.
    if (event.userId === authUser.id) return;
    send(event.type, event);
  });

  // Heartbeat: keeps the connection alive through proxies/firewalls and lets the
  // client detect a dead stream (the client reconnects on a missing ping).
  const heartbeat = setInterval(() => {
    try { res.write(`: heartbeat\n\n`); } catch { /* client gone */ }
  }, 15000);

  req.on('close', () => {
    alive = false;
    clearInterval(heartbeat);
    off();
  });
});

// Presence heartbeat — cheap no-op write, called on login and each sync poll.
apiRouter.post('/presence', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    centralDb.sweepStaleTyping();
    const user = await centralDb.setUserPresence(authUser.id, true);
    res.json({ success: true, user, revision: centralDb.getRevisionInfo().revision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// 11c. Broadcasts Endpoints (Stage 3)
// ----------------------------------------------------
apiRouter.post('/broadcasts', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const adminRoles = [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.GOD, 'ADMIN'];
    if (!adminRoles.includes(authUser.role as any)) {
      return res.status(403).json({ success: false, message: 'فقط مدیران سیستم مجاز به ارسال پیام همگانی هستند.' });
    }

    const { title, body, targetType, recipientUserIds } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ success: false, message: 'متن پیام همگانی الزامی است.' });
    }

    let targetIds: string[] = [];
    if (targetType === 'SELECTED') {
      if (!Array.isArray(recipientUserIds) || recipientUserIds.length === 0) {
        return res.status(400).json({ success: false, message: 'حداقل یک کاربر گیرنده باید انتخاب شود.' });
      }
      targetIds = recipientUserIds;
    } else {
      // ALL active users
      targetIds = (centralDb.getState().users || [])
        .filter((u: any) => u.status !== UserStatus.INACTIVE && u.status !== UserStatus.SUSPENDED)
        .map((u: any) => u.id);
    }

    const result = await centralDb.createBroadcast(
      authUser.id,
      authUser.name,
      title || 'اطلاعیه رسمی سامانه',
      body.trim(),
      targetType || 'ALL',
      targetIds
    );

    await centralDb.logAudit({
      userId: authUser.id, userName: authUser.name, userRole: authUser.role,
      action: 'ارسال پیام همگانی سیستمی', module: ModuleName.CHAT, entityType: 'BROADCAST',
      targetId: result.broadcast.id,
      details: `پیام همگانی "${title}" به ${targetIds.length} کاربر ارسال شد.`,
    });

    res.json({ success: true, broadcast: result.broadcast, recipientCount: result.recipients.length });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/broadcasts', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const broadcasts = centralDb.getBroadcastsForAdmin();
    res.json({ success: true, broadcasts });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/broadcasts/:id', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const result = centralDb.getBroadcastById(req.params.id);
    if (!result.broadcast) return res.status(404).json({ success: false, message: 'پیام همگانی یافت نشد' });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/broadcasts/:id/read', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return res.status(401).json({ success: false, message: 'احراز هویت الزامی است.' });
    const updated = await centralDb.markBroadcastRead(req.params.id, authUser.id);
    res.json({ success: true, marked: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// 12. Registered SIM Holders Endpoints (افراد ثبت‌کننده سیم‌کارت)
// ----------------------------------------------------
apiRouter.get('/registered-holders', (req: Request, res: Response) => {
  try {
    const holders = centralDb.getRegisteredHolders();
    // Compute current active SIMs count per holder
    const sims = centralDb.getState().sims || [];
    const enriched = holders.map((h) => {
      const activeCount = sims.filter((s) => s.registeredHolderId === h.id && s.status !== 'SUSPENDED').length;
      return {
        ...h,
        activeSimCount: activeCount,
        maxCapacity: 10,
        remainingCapacity: Math.max(0, 10 - activeCount),
        isAtCapacity: activeCount >= 10,
      };
    });
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/registered-holders', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req) || centralDb.findUserById('usr-admin');
    const data = req.body || {};
    const fullName = (data.fullName || data.name || '').trim();
    const nationalId = (data.nationalId || data.nationalCode || '').trim();
    const mobile = (data.mobile || data.phone || '').trim();

    if (!fullName || !nationalId || !mobile) {
      return res.status(400).json({ success: false, message: 'نام و نام خانوادگی، کد ملی و شماره همراه الزامی است.' });
    }

    const saved = await centralDb.saveRegisteredHolder({
      ...data,
      fullName,
      nationalId,
      mobile,
      createdBy: data.createdBy || authUser?.id || 'usr-admin',
    });

    res.json({ success: true, holder: saved });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/registered-holders/:id', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req) || centralDb.findUserById('usr-admin');
    // Enforce Manager role check: Only managers / admins can delete registered holders
    const allowedRoles = [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.GOD, 'ADMIN'];
    const isManager = authUser && (allowedRoles.includes(authUser.role) || (authUser.role as string) === 'SUPER_ADMIN');
    
    if (!isManager) {
      return res.status(403).json({
        success: false,
        message: 'فقط مدیران ارشد و سرپرست سامانه مجاز به حذف افراد ثبت‌کننده سیم‌کارت هستند.'
      });
    }

    const { reason } = req.body || {};
    const result = await centralDb.deleteRegisteredHolder(
      req.params.id,
      authUser?.name || authUser?.id || 'مدیر سامانه',
      reason
    );

    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/registered-holders/:id/id-card', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { imageDataUrl, fileName, fileType, sizeBytes } = req.body || {};
    if (!imageDataUrl) {
      return res.status(400).json({ success: false, message: 'تصویر کارت ملی الزامی است.' });
    }

    const holders = centralDb.getRegisteredHolders();
    const holder = holders.find((h) => h.id === id);
    if (!holder) {
      return res.status(404).json({ success: false, message: 'مالک سیم‌کارت یافت نشد.' });
    }

    const updated = await centralDb.saveRegisteredHolder({
      ...holder,
      nationalIdImageUrl: imageDataUrl,
      nationalIdImageName: fileName || holder.nationalIdImageName || `idcard_${holder.nationalId || holder.id}.jpg`,
      nationalIdImageType: fileType || holder.nationalIdImageType || 'image/jpeg',
      nationalIdImageSize: sizeBytes || Math.round(imageDataUrl.length * 0.75),
    });

    res.json({ success: true, holder: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/registered-holders/:id/id-card', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const holders = centralDb.getRegisteredHolders();
    const holder = holders.find((h) => h.id === id);
    if (!holder || !holder.nationalIdImageUrl) {
      return res.status(404).json({ success: false, message: 'تصویر کارت ملی برای این مالک ثبت نشده است.' });
    }

    res.json({
      success: true,
      holderId: holder.id,
      holderName: holder.fullName,
      nationalId: holder.nationalId,
      fileName: holder.nationalIdImageName,
      fileType: holder.nationalIdImageType,
      sizeBytes: holder.nationalIdImageSize,
      dataUrl: holder.nationalIdImageUrl,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// 13. Contract Installments & Finance Referral Endpoints
// ----------------------------------------------------
apiRouter.get('/contract-installments', (req: Request, res: Response) => {
  try {
    const contractId = req.query.contractId as string | undefined;
    const installments = centralDb.getContractInstallments(contractId);
    res.json(installments);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/contract-installments', async (req: Request, res: Response) => {
  try {
    const saved = await centralDb.saveContractInstallment(req.body);
    res.json({ success: true, installment: saved });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.post('/contract-installments/:id/payments', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req) || centralDb.findUserById('usr-admin');
    const installmentId = req.params.id;
    const paymentData = req.body;

    const result = await centralDb.recordInstallmentPayment(installmentId, {
      ...paymentData,
      recordedByUserId: authUser?.id,
      recordedByUserName: authUser?.name,
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Review by Finance Manager / ارجاع به مدیر مالی
apiRouter.post('/payments/:id/finance-review', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req) || centralDb.findUserById('usr-admin');
    const { status, notes } = req.body;
    const payment = (centralDb.getState().payments || []).find((p) => p.id === req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'رسید پرداخت یافت نشد' });
    }

    const updatedPayment: Payment = {
      ...payment,
      financeReviewStatus: status || 'REVIEWED',
      financeNotes: notes || '',
      financeReviewedBy: authUser?.name || 'مدیر مالی',
      financeReviewedAt: new Date().toISOString(),
    };

    await centralDb.savePayment(updatedPayment);
    res.json({ success: true, payment: updatedPayment });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------
// 14. Biometric WebAuthn & Trusted Devices Endpoints
// ----------------------------------------------------
apiRouter.get('/biometrics/devices', (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const userId = (req.query.userId as string) || authUser?.id;
    const devices = centralDb.getTrustedBiometricDevices(userId);
    res.json(devices);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/biometrics/register', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req) || centralDb.findUserById('usr-admin');
    const { credentialId, deviceName, deviceType, publicKey } = req.body;
    if (!credentialId) {
      return res.status(400).json({ success: false, message: 'شناسه امنیتی دستگاه الزامی است.' });
    }

    const savedDevice = await centralDb.registerBiometricDevice({
      id: `bio-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: authUser?.id || 'usr-admin',
      credentialId,
      deviceName: deviceName || 'دستگاه قابل اعتماد بیومتریک',
      deviceType: deviceType || 'FINGERPRINT',
      publicKey,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      isRevoked: false,
    });

    res.json({ success: true, device: savedDevice });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/biometrics/devices/:id', async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const revoked = await centralDb.revokeBiometricDevice(req.params.id, authUser?.id);
    if (!revoked) {
      return res.status(404).json({ success: false, message: 'دستگاه یافت نشد یا مجاز به ابطال نیستید' });
    }
    res.json({ success: true, message: 'دستگاه بیومتریک ابطال گردید' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Biometric Challenge
apiRouter.post('/auth/biometric-challenge', (req: Request, res: Response) => {
  const challenge = Buffer.from(Date.now().toString() + '-' + Math.random().toString()).toString('base64');
  res.json({ challenge });
});

// Biometric Login Verify
apiRouter.post('/auth/biometric-login', async (req: Request, res: Response) => {
  try {
    const { credentialId } = req.body;
    if (!credentialId) {
      return res.status(400).json({ success: false, message: 'شناسه اعتبارسنجی بیومتریک ارسال نشده است.' });
    }

    const device = centralDb.findBiometricDeviceByCredentialId(credentialId);
    if (!device) {
      return res.status(401).json({
        success: false,
        message: 'دستگاه بیومتریک ثبت‌نشده یا ابطال شده است. لطفاً ابتدا با نام کاربری و رمز عبور وارد شوید.'
      });
    }

    const user = centralDb.findUserById(device.userId);
    if (!user || user.status === UserStatus.INACTIVE || user.status === UserStatus.SUSPENDED) {
      return res.status(403).json({ success: false, message: 'حساب کاربری کاربر غیرفعال یا معلق است.' });
    }

    await centralDb.updateBiometricDeviceLastUsed(credentialId);

    const token = `token-${user.id}-${Date.now()}`;
    const now = new Date().toISOString();
    const updatedUser = { ...user, lastLoginAt: now };
    await centralDb.saveUser(updatedUser);

    res.json({
      success: true,
      token,
      user: updatedUser,
      message: 'ورود موفق با احراز هویت بیومتریک',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});



