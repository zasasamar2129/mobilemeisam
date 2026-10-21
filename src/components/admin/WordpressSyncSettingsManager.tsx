import React, { useState, useEffect } from 'react';
import { Globe, Shield, RefreshCw, CheckCircle, AlertTriangle, Power } from 'lucide-react';
import { storage } from '../../services/storage';
import { testConnection } from '../../services/wordpressSync';

export const WordpressSyncSettingsManager: React.FC = () => {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [apiUrl, setApiUrl] = useState<string>('');
  const [syncSecret, setSyncSecret] = useState<string>('');
  const [timeoutMs, setTimeoutMs] = useState<number>(10000);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);
  const [saved, setSaved] = useState<boolean>(false);

  useEffect(() => {
    const settings = storage.getWordpressSyncSettings();
    setEnabled(settings.enabled);
    setApiUrl(settings.apiUrl);
    setSyncSecret(settings.syncSecret);
    setTimeoutMs(settings.timeoutMs);
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    storage.saveWordpressSyncSettings({ enabled, apiUrl, syncSecret, timeoutMs });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      // Save temp state first so testConnection reads the currently typed values
      storage.saveWordpressSyncSettings({ enabled, apiUrl, syncSecret, timeoutMs });
      const res = await testConnection();
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: 'خطا در برقراری ارتباط' });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {saved && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-center gap-3 text-emerald-800 dark:text-emerald-300">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-xs font-bold">تنظیمات همگام‌سازی با موفقیت ذخیره شد.</span>
        </div>
      )}

      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5 shadow-xs">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                راه‌اندازی و تنظیمات همگام‌سازی وب‌سایت اول سیم
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                اتصال سامانه MMBA به کاتالوگ عمومی وردپرس
              </p>
            </div>
          </div>
          <span
            className={`px-3 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap ${
              enabled
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {enabled ? 'فعال' : 'غیرفعال'}
          </span>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Power className="w-4 h-4 text-indigo-500" />
                فعال‌سازی همگام‌سازی با وردپرس
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                در صورت غیرفعال بودن، هیچ درخواستی به وب‌سایت ارسال نمی‌شود و انتشار داده‌ها متوقف می‌ماند.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                آدرس پایه API وردپرس
              </label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://avalsim.ir/wp-json/mmba/v1"
                dir="ltr"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 text-xs font-mono"
              />
              <p className="text-[10px] text-slate-400 font-mono">AVALSIM_WORDPRESS_API_BASE_URL</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                مهلت زمانی انتظار (میلی‌ثانیه)
              </label>
              <input
                type="number"
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(Number(e.target.value))}
                dir="ltr"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 text-xs font-mono"
              />
              <p className="text-[10px] text-slate-400 font-mono">AVALSIM_WORDPRESS_TIMEOUT_MS</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-500" />
              کلید امنیتی اشتراکی همگام‌سازی (HMAC Secret)
            </label>
            <input
              type="password"
              value={syncSecret}
              onChange={(e) => setSyncSecret(e.target.value)}
              placeholder="کلید مخصوص ارتباط با افزونه وردپرس"
              dir="ltr"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 text-xs font-mono"
            />
            <p className="text-[10px] text-slate-400 font-mono">AVALSIM_WORDPRESS_SYNC_SECRET</p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed pt-1">
              این کلید فقط روی سرور نگهداری می‌شود و هرگز در مرورگر، حافظه محلی یا مخزن کد ذخیره نمی‌گردد.
            </p>
          </div>

          {testResult && (
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-3 ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300'
                  : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="text-xs font-bold">{testResult.message}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-2 transition-all disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
              تست اتصال
            </button>

            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-xs"
            >
              ذخیره تنظیمات
            </button>
          </div>
        </form>
      </div>

      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
          راهنمای راه‌اندازی و امنیت داده‌ها
        </h3>
        <ul className="list-disc list-inside space-y-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          <li>سامانه MMBA به عنوان مرجع معتبر برای موجودی، قیمت‌گذاری، رزرو و قراردادها باقی می‌ماند.</li>
          <li>اطلاعات خریدار، قیمت خرید، کدملی، PIN/PUK، ICCID، اطلاعات قرارداد و امانت هرگز به وردپرس ارسال نمی‌شود.</li>
          <li>انتشار هر شماره در سایت نیازمند تایید صریح کاربر است و به صورت خودکار انجام نمی‌شود.</li>
          <li>تا زمان آماده‌سازی افزونه وردپرس و ورود مقادیر معتبر، این قابلیت غیرفعال می‌ماند.</li>
        </ul>
      </div>
    </div>
  );
};
