import React from 'react';
import { uploadManager, UploadResult } from '../../lib/uploadManager';
import { UploadItem, UploadPhase, uploadErrorMessage } from '../../lib/uploadTypes';
import { useTranslation } from '../../lib/i18n';
import { motion, AnimatePresence } from 'motion/react';
import { UploadCloud, CheckCircle2, AlertTriangle, Loader2, X, RotateCcw, FileText } from 'lucide-react';
import { cn } from './Button';

export interface UploadProgressListProps {
  items: UploadItem[];
  onRetry: (item: UploadItem) => Promise<UploadResult | void>;
}

const PHASE_LABELS: Record<UploadPhase, { fa: string; en: string; color: string; icon: React.ReactNode }> = {
  SELECTED: { fa: 'در صف بارگذاری', en: 'Queued', color: 'text-slate-500', icon: <UploadCloud className="w-3.5 h-3.5" /> },
  VALIDATING: { fa: 'بررسی فایل', en: 'Validating', color: 'text-slate-500', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  UPLOADING: { fa: 'در حال بارگذاری', en: 'Uploading', color: 'text-indigo-600 dark:text-indigo-400', icon: <UploadCloud className="w-3.5 h-3.5 animate-pulse" /> },
  UPLOADED: { fa: 'تأیید سرور', en: 'Confirming', color: 'text-slate-500', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  PROCESSING: { fa: 'در حال پردازش', en: 'Processing', color: 'text-amber-600 dark:text-amber-400', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  READY: { fa: 'آماده', en: 'Ready', color: 'text-emerald-600 dark:text-emerald-400', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  FAILED: { fa: 'ناموفق', en: 'Failed', color: 'text-rose-500', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  CANCELLED: { fa: 'لغو شده', en: 'Cancelled', color: 'text-slate-400', icon: <X className="w-3.5 h-3.5" /> },
};

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Shared upload progress bar (§12 states, live from UploadManager). */
export const UploadProgressList: React.FC<UploadProgressListProps> = ({ items, onRetry }) => {
  const { isRtl } = useTranslation();

  const active = items.filter((i) => i.phase !== 'READY' && i.phase !== 'CANCELLED');
  const readyCount = items.filter((i) => i.phase === 'READY').length;
  const latestError = items.filter((i) => i.phase === 'FAILED').length;

  const progressBanner = () => {
    const uploading = items.filter((i) => i.phase === 'UPLOADING');
    const processing = items.filter((i) => i.phase === 'PROCESSING' || i.phase === 'UPLOADED');
    const total = items.length;
    if (total === 0) return null;
    const done = items.filter((i) => i.phase === 'READY').length;
    if (done === total && total > 0) {
      return (
        <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {isRtl ? `همه فایل‌ها آماده‌اند (${done})` : `All files ready (${done})`}
        </div>
      );
    }
    if (uploading.length > 0) {
      return (
        <div className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {isRtl ? `در حال بارگذاری… ${uploading.length} فایل` : `Uploading… ${uploading.length} file(s)`}
        </div>
      );
    }
    if (processing.length > 0 || readyCount > 0) {
      return (
        <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {isRtl ? 'در حال پردازش و نهایی‌سازی…' : 'Processing & finalizing…'}
        </div>
      );
    }
    return null;
  };

  return (
    <>
      {/* Compact live banner while anything is busy */}
      <AnimatePresence>
        {active.length > 0 && !readyCount && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="relative z-40 flex items-center gap-2 px-3.5 py-4 mb-3 rounded-2xl border border-indigo-200 dark:border-indigo-500/30 bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl shadow-md"
          >
            <UploadCloud className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-pulse" />
            <div className="flex-1 min-w-0">
              {progressBanner()}
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                {(() => {
                  const u = items.find((i) => i.phase === 'UPLOADING' || i.phase === 'PROCESSING' || i.phase === 'UPLOADED');
                  const pct = u ? u.progress : undefined;
                  return (
                    <div
                      className={cn('h-full rounded-full bg-indigo-500 transition-all duration-300', pct === undefined ? 'w-full progress-striped' : '')}
                      style={{ width: pct !== undefined ? `${pct}%` : undefined }}
                    />
                  );
                })()}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full list while someone is running */}
      <AnimatePresence initial={false}>
        {items.map((item) => {
          if (item.phase === 'READY' || item.phase === 'CANCELLED') return null;
          const label = PHASE_LABELS[item.phase];
          return (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
              className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xs mb-2"
            >
              <div className="p-2 rounded-lg bg-indigo-100/70 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{item.fileName}</p>
                  <span className={cn('text-[10px] font-semibold flex items-center gap-1 shrink-0', label.color)}>
                    {label.icon}
                    {isRtl ? label.fa : label.en}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono">
                  {fmtSize(item.fileSize)} • {item.progress}%
                </p>
                {item.phase === 'FAILED' && (
                  <p className="text-[10px] text-rose-500 break-all">{item.error || 'Upload failed'}</p>
                )}
                {item.phase === 'UPLOADING' && (
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${item.progress}%` }} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {item.phase === 'FAILED' && (
                  <button
                    type="button"
                    onClick={() => void onRetry(item)}
                    title={isRtl ? 'تلاش دوباره' : 'Retry'}
                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
                {['UPLOADING', 'UPLOADED', 'PROCESSING', 'SELECTED', 'VALIDATING'].includes(item.phase) && (
                  <button
                    type="button"
                    onClick={() => void uploadManager.cancel(item)}
                    title={isRtl ? 'لغو' : 'Cancel'}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {latestError === 0 && readyCount === 0 && items.length === 0 ? null : (
        <div className="text-[10px] text-slate-400 mt-1">
          {readyCount > 0 && <span className="text-emerald-600">{isRtl ? `${readyCount} سند آماده شد` : `${readyCount} document(s) ready`}</span>}
          {latestError > 0 && <span className="ms-2 text-rose-500">{isRtl ? `${latestError} خطا — با [تلاش دوباره] ادامه دهید` : `${latestError} error(s) — retry with [Retry]`}</span>}
        </div>
      )}
    </>
  );
};

export { uploadErrorMessage };