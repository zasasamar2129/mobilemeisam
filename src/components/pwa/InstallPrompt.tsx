import React, { useEffect, useState } from 'react';
import { Download, Share, PlusSquare, X, Smartphone } from 'lucide-react';
import { isIos, isStandalone } from '../../services/pushService';

const DISMISS_KEY = 'mmba_install_dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Install guidance for the PWA.
 *
 * Push notifications on iOS only work once the app is installed to the home
 * screen, and iOS exposes no programmatic install prompt — so the only way to
 * get a user there is to tell them. Android/Chrome fires `beforeinstallprompt`
 * and can be prompted directly.
 *
 * Renders nothing once installed, or when dismissed for this browser.
 */
export const InstallPrompt: React.FC = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [dismissed, setDismissed] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1'
  );

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode — dismissal just won't persist */
    }
    setDismissed(true);
  };

  // ---- iOS: no programmatic install, so instruct instead. -------------------
  if (isIos()) {
    return (
      <div
        dir="rtl"
        className="fixed bottom-4 start-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-4 flex gap-3"
        role="status"
      >
        <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
            برای دریافت اعلان، برنامه را نصب کنید
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            در نوار پایین مرورگر، دکمه اشتراک‌گذاری
            <Share className="inline w-3 h-3 mx-0.5 align-text-bottom" /> را بزنید و
            «Add to Home Screen» را انتخاب کنید.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="بستن"
          className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ---- Android / desktop: the browser gives us a real install prompt. -------
  if (!deferred) return null;

  const install = async () => {
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
    } catch {
      /* user dismissed or the prompt was already consumed */
    } finally {
      setDeferred(null);
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed bottom-4 start-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-3 flex items-center gap-3"
      role="status"
    >
      <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
        <Download className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
          نصب برنامه روی این دستگاه
        </p>
        <p className="text-[11px] text-slate-600 dark:text-slate-400">
          برای دریافت اعلان‌ها حتی وقتی برنامه باز نیست.
        </p>
      </div>
      <button
        type="button"
        onClick={install}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition-colors"
      >
        <PlusSquare className="w-3.5 h-3.5" />
        نصب
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="بستن"
        className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
