import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Globe, ExternalLink, Edit3, Smartphone, Tag, ShieldCheck, AlertCircle, CheckCircle2, Send } from 'lucide-react';
import { fetchSimsFromWordpress, updateSimDisplayFields, testConnection } from '../../services/wordpressSync';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { storage } from '../../services/storage';
import { useToast } from '../ui/Toast';
import { useTranslation } from '../../lib/i18n';

export interface WordpressSim {
  id: number;
  title: string;
  status: string;
  link: string;
  phone_number: string;
  rond_type_1: string;
  rond_type_2: string;
  sale_price: number;
  public_id: string;
  version: number;
  listing_status: string;
  modified: string;
}

/** Live-refresh cadence for the catalogue. */
const LIVE_REFRESH_MS = 30000;

export const WordpressCataloguePanel: React.FC = () => {
  const { t, isRtl } = useTranslation();
  const { success, error } = useToast();
  const [sims, setSims] = useState<WordpressSim[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  // Publish Popup State
  const [editSim, setEditSim] = useState<WordpressSim | null>(null);
  const [rondType1, setRondType1] = useState('');
  const [rondType2, setRondType2] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Guards the polling interval from overlapping in-flight requests.
  const inFlight = useRef(false);

  const loadSims = async (silent = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!silent) setIsLoading(true);

    const settings = storage.getWordpressSyncSettings();
    if (!settings.enabled) {
      setErrorMsg(isRtl ? 'همگام‌سازی وردپرس غیرفعال است. آن را از بخش «همگام‌سازی وردپرس» فعال کنید.' : 'WordPress sync is disabled. Enable it in the WordPress Sync tab.');
      setSims([]);
      setIsLoading(false);
      inFlight.current = false;
      return;
    }

    setErrorMsg(null);
    try {
      const check = await testConnection();
      if (!check.success) {
        setErrorMsg(check.message);
        setSims([]);
      } else {
        const res = await fetchSimsFromWordpress();
        if (res.success) {
          setSims(res.sims as WordpressSim[]);
          setLastLoadedAt(new Date().toISOString());
        } else {
          setErrorMsg(res.message || 'خطا در دریافت اطلاعات');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'خطای شبکه');
    } finally {
      setIsLoading(false);
      inFlight.current = false;
    }
  };

  useEffect(() => {
    loadSims();
    const timer = setInterval(() => loadSims(true), LIVE_REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPublishModal = (sim: WordpressSim) => {
    setEditSim(sim);
    setRondType1(sim.rond_type_1 || '');
    setRondType2(sim.rond_type_2 || '');
  };

  const handlePublish = async () => {
    if (!editSim) return;
    if (!editSim.public_id) {
      error(
        isRtl
          ? 'این شماره کد یکتای سامانه (public_id) ندارد و از طریق پنل ثبت نشده است.'
          : 'This listing has no public_id and was not created by the panel.'
      );
      return;
    }
    setIsSaving(true);
    try {
      const res = await updateSimDisplayFields({
        publicId: editSim.public_id,
        version: editSim.version,
        phoneNumber: editSim.phone_number,
        rondType1,
        rondType2,
        listingStatus: editSim.listing_status || 'PUBLISHED',
      });
      if (res.success) {
        success(res.message);
        setEditSim(null);
        loadSims();
      } else {
        error(res.message);
      }
    } catch (err: any) {
      error(err.message || 'خطا در بروزرسانی');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
              {isRtl ? 'کاتالوگ زنده وردپرس' : 'Live WordPress Catalogue'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {lastLoadedAt
                ? isRtl
                  ? `آخرین بروزرسانی: ${new Date(lastLoadedAt).toLocaleTimeString('fa-IR')} — بروزرسانی خودکار هر ۳۰ ثانیه`
                  : `Last updated: ${new Date(lastLoadedAt).toLocaleTimeString()} — auto-refresh every 30s`
                : isRtl
                  ? 'شماره‌های منتشر شده در سایت اول سیم'
                  : 'SIMs currently live on AVALSIM website'}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => loadSims()}
          disabled={isLoading}
          leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
        >
          {isRtl ? 'بروزرسانی لیست' : 'Refresh List'}
        </Button>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-center gap-3 text-rose-800 dark:text-rose-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div className="text-xs font-bold">{errorMsg}</div>
        </div>
      )}

      {/* Grid/Table of WP Listings */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-4">{isRtl ? 'شماره سیم‌کارت' : 'Phone Number'}</th>
                <th className="p-4">{isRtl ? 'نوع رند ۱' : 'Rond Type 1'}</th>
                <th className="p-4">{isRtl ? 'نوع رند ۲' : 'Rond Type 2'}</th>
                <th className="p-4">{isRtl ? 'وضعیت در سایت' : 'WP Status'}</th>
                <th className="p-4">{isRtl ? 'آخرین تغییر' : 'Last Modified'}</th>
                <th className="p-4 text-left">{isRtl ? 'عملیات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sims.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400 italic">
                    {isRtl ? 'شماره‌ای در وردپرس یافت نشد یا همگام‌سازی برقرار نیست.' : 'No listings found in WordPress or sync is disconnected.'}
                  </td>
                </tr>
              ) : (
                sims.map((sim) => (
                  <tr key={sim.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 font-mono font-bold text-slate-900 dark:text-slate-100 text-sm" dir="ltr">
                      {sim.phone_number || '-'}
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                        {sim.rond_type_1 || '-'}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                        {sim.rond_type_2 || '-'}
                      </span>
                    </td>
                    <td className="p-4">
                      {sim.status === 'publish' ? (
                        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {isRtl ? 'منتشر شده' : 'Published'}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-slate-400 font-medium italic">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {sim.status}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-slate-500 dark:text-slate-400 tabular-nums" dir="ltr">
                      {sim.modified ? new Date(sim.modified).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={sim.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-sky-500 transition-all"
                          title={isRtl ? 'مشاهده در سایت' : 'View on Website'}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => openPublishModal(sim)}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold text-[11px] flex items-center gap-1.5 transition-all"
                          title={isRtl ? 'انتشار فیلدهای نمایشی در وردپرس' : 'Publish fields to WordPress'}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          {isRtl ? 'انتشار' : 'Publish'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Publish Modal */}
      <Modal
        isOpen={!!editSim}
        onClose={() => setEditSim(null)}
        title={
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-indigo-500" />
            <span>{isRtl ? `انتشار شماره ${editSim?.phone_number}` : `Publish Listing: ${editSim?.phone_number}`}</span>
          </div>
        }
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <Button variant="outline" size="sm" onClick={() => setEditSim(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handlePublish}
              disabled={isSaving}
              leftIcon={<Send className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />}
            >
              {isRtl ? 'انتشار در وردپرس' : 'Publish to WordPress'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5 p-1">
          <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 space-y-2">
            <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-900 dark:text-indigo-300">
              <Smartphone className="w-4 h-4" />
              <span>{isRtl ? 'اطلاعات سیستمی شماره' : 'System Information'}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-[11px]">
              <div className="text-slate-500">{isRtl ? 'شماره خط:' : 'Phone:'} <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{editSim?.phone_number}</span></div>
              <div className="text-slate-500">{isRtl ? 'کد یکتا (UUID):' : 'Public ID:'} <span className="font-mono truncate block" title={editSim?.public_id}>{editSim?.public_id || '-'}</span></div>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              label={isRtl ? 'نوع رند ۱ (rond_type_1)' : 'Rond Type 1 (rond_type_1)'}
              value={rondType1}
              onChange={(e) => setRondType1(e.target.value)}
              placeholder={isRtl ? 'مثال: استپ دار خشک' : 'e.g. Step / Mirror'}
              leftIcon={<Tag className="w-4 h-4 text-slate-400" />}
            />

            <Input
              label={isRtl ? 'نوع رند ۲ (rond_type_2)' : 'Rond Type 2 (rond_type_2)'}
              value={rondType2}
              onChange={(e) => setRondType2(e.target.value)}
              placeholder={isRtl ? 'مثال: رند / معمولی' : 'e.g. Round / Normal'}
              leftIcon={<Smartphone className="w-4 h-4 text-slate-400" />}
            />
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 rounded-xl flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
              {isRtl
                ? 'با فشردن دکمه انتشار، مقادیر فوق مستقیماً روی فیلدهای ACF وردپرس (rond_type_1 و rond_type_2) نوشته می‌شود. قیمت فروش تغییر نمی‌کند.'
                : 'Pressing publish writes these values directly to the WordPress ACF fields (rond_type_1 and rond_type_2). Sale price is not modified.'}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
