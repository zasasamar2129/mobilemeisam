import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Volume2, VolumeX, CheckCheck, ExternalLink } from 'lucide-react';
import { Notification, NotificationSettings } from '../../types';
import { storage, subscribeToStorage } from '../../services/storage';
import { pushService, playNotificationSound, type SoundType } from '../../services/pushService';
import { formatPersianDateTime } from '../../lib/dateUtils';

const POLL_MS = 8000;

/** Settings chime names are a superset of the sounds pushService can play. */
function toSoundType(chime: NotificationSettings['soundChime']): SoundType {
  switch (chime) {
    case 'bell':
      return 'bell';
    case 'subtle':
      return 'subtle';
    case 'chime':
      return 'bell';
    case 'crystal':
    default:
      return 'crystal';
  }
}

export interface NotificationBellProps {
  currentUser?: { id: string; name?: string };
  /** Navigate to a tab (e.g. 'sims', 'tasks') when a reminder is opened. */
  onNavigate?: (tab: string) => void;
  /** Optional deep-link for SIM reminders so the record can be opened directly. */
  onOpenSim?: (simId: string) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  currentUser,
  onNavigate,
  onOpenSim,
}) => {
  const userId = currentUser?.id || 'usr-admin';
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  // Sound starts opt-in: browsers block audio before a user gesture anyway, so
  // the first click is what both unlocks playback and records the preference.
  const [soundEnabled, setSoundEnabled] = useState(false);
  const seenIdsRef = useRef<Set<string> | null>(null);
  const soundEnabledRef = useRef(false);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const s = await pushService.getSettings();
        if (!cancelled) setSettings(s);
      } catch {
        /* settings are advisory — never block notifications on a failed fetch */
      }
    };

    const tick = () => {
      const mine = (storage.getNotifications() || []).filter((n) => !n.userId || n.userId === userId);
      setItems(mine);

      // First run only records what is already known; it must never alert on
      // a backlog that the user has not seen yet.
      if (seenIdsRef.current === null) {
        seenIdsRef.current = new Set(mine.map((n) => n.id));
        return;
      }

      const fresh = mine.filter((n) => !seenIdsRef.current!.has(n.id));
      if (fresh.length === 0) return;
      fresh.forEach((n) => seenIdsRef.current!.add(n.id));

      // Audio is best-effort. If the browser blocks it the in-app text alert
      // above is already rendered — that is the fallback, not the other way round.
      if (soundEnabledRef.current) {
        try {
          playNotificationSound(toSoundType(settings?.soundChime || 'crystal'), settings?.soundVolume ?? 80);
        } catch {
          /* autoplay policy or muted device — text alert stands on its own */
        }
      }
    };

    tick();
    loadSettings();
    const id = setInterval(tick, POLL_MS);
    const unsub = subscribeToStorage(tick);
    return () => {
      cancelled = true;
      clearInterval(id);
      unsub();
    };
  }, [userId, settings?.soundChime, settings?.soundVolume]);

  const unread = useMemo(() => items.filter((n) => !n.read && !n.isRead).length, [items]);

  const handleToggleSound = () => {
    const next = !soundEnabledRef.current;
    setSoundEnabled(next);
    if (next) {
      // A real user gesture: this is what lets the AudioContext start.
      try {
        playNotificationSound(toSoundType(settings?.soundChime || 'crystal'), settings?.soundVolume ?? 80);
      } catch {
        /* ignore */
      }
    }
  };

  const handleOpen = (n: Notification) => {
    storage.markNotificationAsRead(n.id);
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true, isRead: true } : x)));
    setOpen(false);
    if (n.relatedEntityType === 'SIM_DEED' && n.relatedEntityId && onOpenSim) {
      onOpenSim(n.relatedEntityId);
    } else if (n.relatedEntityType === 'TASK') {
      onNavigate?.('tasks');
    }
  };

  return (
    <div className="relative" data-testid="notification-bell">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 rounded-xl bg-surface-subtle dark:bg-surface-subtle hover:bg-slate-200 dark:hover:bg-slate-800 border border-primary flex items-center justify-center text-secondary transition-all shadow-xs"
        title="اعلان‌ها"
        aria-label={`اعلان‌ها${unread > 0 ? ` (${unread} خوانده‌نشده)` : ''}`}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -left-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-[300px] sm:w-[340px] rounded-2xl bg-surface border border-primary shadow-2xl z-50 animate-fadeIn overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-primary bg-surface-subtle">
              <span className="text-xs font-bold">اعلان‌ها ({items.length})</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleToggleSound}
                  title={soundEnabled ? 'قطع صدای اعلان' : 'فعال‌سازی صدای اعلان'}
                  className={`p-1.5 rounded-lg border transition-colors ${
                    soundEnabled
                      ? 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10'
                      : 'border-primary text-muted hover:text-secondary'
                  }`}
                >
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    storage.markAllNotificationsAsRead();
                    setItems((prev) => prev.map((n) => ({ ...n, read: true, isRead: true })));
                  }}
                  className="p-1.5 rounded-lg border border-primary text-muted hover:text-secondary"
                  title="علامت‌گذاری همه به عنوان خوانده‌شده"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {items.length === 0 ? (
                <p className="p-6 text-center text-xs text-muted">اعلانی برای نمایش وجود ندارد.</p>
              ) : (
                items.slice(0, 50).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleOpen(n)}
                    className={`w-full text-right p-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                      n.read || n.isRead ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{n.title}</span>
                      {n.relatedEntityType === 'SIM_DEED' && (
                        <ExternalLink className="w-3 h-3 text-indigo-500 shrink-0 mt-0.5" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                    <span className="text-[10px] text-muted font-mono mt-1 block" dir="ltr">
                      {formatPersianDateTime(n.createdAt)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
