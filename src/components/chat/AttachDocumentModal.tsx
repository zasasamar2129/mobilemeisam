import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Attachment } from '../../types';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useTranslation } from '../../lib/i18n';
import { Search, FileText, Paperclip, Check, UploadCloud, X, Loader2, AlertTriangle } from 'lucide-react';
import { storage } from '../../services/storage';
import { computeSHA256 } from '../../lib/fileUtils';
import { validateUploadFile, makeUploadKey, UploadItem, uploadErrorMessage } from '../../lib/uploadTypes';
import { uploadManager } from '../../lib/uploadManager';
import { createThumbnail } from '../../lib/filePreviewUtils';
import { cn } from '../ui/Button';

export interface AttachDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  attachments: Attachment[];
  onSelectAttachment: (attachment: Attachment) => void;
}

type Tab = 'documents' | 'device';

/** Attach picker — two paths (§6): select an existing MMBA Document, or upload a
 *  file from the device through the shared Upload Manager → Document Engine (§7).
 *  No separate Chat file storage: the confirmed Attachment becomes a
 *  MessageAttachment reference on send. */
export const AttachDocumentModal: React.FC<AttachDocumentModalProps> = ({
  isOpen,
  onClose,
  attachments = [],
  onSelectAttachment,
}) => {
  const { isRtl } = useTranslation();
  const [tab, setTab] = useState<Tab>('documents');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploadItem, setUploadItem] = useState<UploadItem | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live progress from the shared manager while this modal is open.
  useEffect(() => {
    if (!isOpen) return;
    const unsub = uploadManager.subscribe({ onChange: (item) => setUploadItem(item) });
    return unsub;
  }, [isOpen]);

  // Reset picker state on open.
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedId(null);
      setUploadItem(null);
      setIsUploading(false);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    return (attachments || []).filter((a) => {
      if (!q) return true;
      return (a.fileName || '').toLowerCase().includes(q) || (a.fileType || '').toLowerCase().includes(q);
    });
  }, [attachments, query]);

  const selectedAttachment = attachments.find((a) => a.id === selectedId);

  const handleConfirm = () => {
    if (selectedAttachment) {
      onSelectAttachment(selectedAttachment);
      setSelectedId(null);
      onClose();
    }
  };

  const handleDeviceFile = async (file: File) => {
    if (!file) return;
    // Clear input immediately so the same file can be reselected.
    if (fileInputRef.current) fileInputRef.current.value = '';

    const v = validateUploadFile(file);
    if (!v.ok) {
      setUploadItem({ key: makeUploadKey(undefined, file), fileName: file.name, fileSize: file.size, fileType: file.type, phase: 'FAILED', progress: 0, canRetry: false, createdAt: new Date().toISOString(), error: v.error });
      return;
    }

    setIsUploading(true);
    const key = makeUploadKey(undefined, file);
    let dataUrl = '';
    let sha256 = '';
    try {
      dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error || new Error('read failed'));
        r.readAsDataURL(file);
      });
      sha256 = await computeSHA256(dataUrl);
    } catch {
      setUploadItem({ key, fileName: file.name, fileSize: file.size, fileType: file.type, phase: 'FAILED', progress: 0, canRetry: false, createdAt: new Date().toISOString(), error: 'خطا در خواندن فایل / failed to read file' });
      setIsUploading(false);
      return;
    }

    // Duplicate fast-path against the resolved document list (§9).
    const dup = (attachments || []).find((a) => a.sha256 && a.sha256 === sha256);
    if (dup) {
      setUploadItem({ key, fileName: file.name, fileSize: file.size, fileType: file.type, sha256, phase: 'FAILED', progress: 0, canRetry: false, createdAt: new Date().toISOString(), error: uploadErrorMessage('duplicate', file.name) });
      setIsUploading(false);
      return;
    }

    const my = storage.getCurrentUser();
    const fileType = v.fileType || file.type || 'application/octet-stream';
    const result = await uploadManager.upload({
      file,
      id: '',
      fileName: file.name,
      fileSize: file.size,
      fileType,
      mimeType: fileType,
      sha256,
      key,
      dataUrl,
      category: fileType.startsWith('image/')
        ? (isRtl ? 'تصویر و مدرک شناسایی' : 'Identity / Image')
        : (isRtl ? 'سند و قرارداد' : 'Document / Contract'),
      uploadedByUserId: my.id,
      uploadedByUserName: my.name,
    });

    if (result.ok) {
      const confirmed: Attachment = {
        id: result.id!,
        fileName: file.name,
        displayName: file.name,
        originalName: file.name,
        fileType,
        mimeType: fileType,
        fileSize: file.size,
        dataUrl,
        sha256,
        category: fileType.startsWith('image/')
          ? (isRtl ? 'تصویر و مدرک شناسایی' : 'Identity / Image')
          : (isRtl ? 'سند و قرارداد' : 'Document / Contract'),
        uploadedByUserId: my.id,
        uploadedByUserName: my.name,
        uploadStatus: 'PROCESSING',
      };
      storage.confirmAttachment(confirmed);
      createThumbnail(dataUrl).then((thumb) => storage.updateAttachmentThumbnail(confirmed.id, thumb)).catch(() => {});
      setIsUploading(false);
      onSelectAttachment(confirmed);
      onClose();
    } else {
      setUploadItem({ key, fileName: file.name, fileSize: file.size, fileType, sha256, phase: 'FAILED', progress: 0, canRetry: result.code !== 'duplicate', createdAt: new Date().toISOString(), error: result.message });
      setIsUploading(false);
    }
  };

  const phaseState = uploadItem?.phase;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={isRtl ? 'پیوست فایل به پیام' : 'Attach File to Message'}
      subtitle={isRtl ? 'از اسناد سیستم انتخاب کنید یا از دستگاه بارگذاری کنید' : 'Select from system documents or upload from device'}
    >
      <div className="space-y-3">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 mb-1">
          <button
            type="button"
            onClick={() => setTab('documents')}
            className={cn(
              'flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5',
              tab === 'documents'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            )}
          >
            <FileText className="w-3.5 h-3.5" />
            {isRtl ? 'اسناد MMBA' : 'MMBA Documents'}
          </button>
          <button
            type="button"
            onClick={() => setTab('device')}
            className={cn(
              'flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5',
              tab === 'device'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            )}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            {isRtl ? 'ارسال از دستگاه' : 'Upload from Device'}
          </button>
        </div>

        {tab === 'documents' && (
          <>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isRtl ? 'جستجو در نام اسناد...' : 'Search document name...'}
              rightIcon={<Search className="w-4 h-4 text-slate-400" />}
            />
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
              {filtered.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  {isRtl ? 'سندی برای انتخاب یافت نشد.' : 'No documents available.'}
                </div>
              ) : (
                filtered.map((att) => {
                  const isSelected = att.id === selectedId;
                  return (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => setSelectedId(att.id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-right transition-all ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 ring-1 ring-indigo-500'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate text-slate-800 dark:text-slate-200">{att.fileName}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {(att.fileSize ? (att.fileSize / 1024).toFixed(1) + ' KB' : '')} • {att.fileType || 'file'}
                          </p>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}

        {tab === 'device' && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleDeviceFile(f);
              }}
              disabled={isUploading}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full p-5 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer flex flex-col items-center gap-2"
            >
              <div className="p-3 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <UploadCloud className="w-6 h-6" />}
              </div>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {isUploading
                  ? isRtl ? 'در حال بارگذاری…' : 'Uploading…'
                  : isRtl ? 'انتخاب فایل از حافظه دستگاه' : 'Choose file from device'}
              </span>
              <span className="text-[10px] text-slate-400">
                {isRtl ? 'تصویر، PDF و اسناد متنی تا ۱۰ مگابایت' : 'Images, PDFs and text docs up to 10MB'}
              </span>
            </button>

            {/* Live upload state from UploadManager (§12) */}
            {uploadItem && phaseState && (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right">
                {['UPLOADING', 'UPLOADED', 'PROCESSING', 'VALIDATING', 'SELECTED'].includes(phaseState) ? (
                  <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
                ) : phaseState === 'READY' ? (
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{uploadItem.fileName}</p>
                  <p className="text-[10px] text-slate-400">
                    {phaseState === 'READY'
                      ? (isRtl ? 'آماده' : 'Ready')
                      : phaseState === 'FAILED'
                      ? (uploadItem.error || 'خطا')
                      : (isRtl ? `در حال بارگذاری… ${uploadItem.progress}%` : `Uploading… ${uploadItem.progress}%`)}
                  </p>
                  {(phaseState === 'UPLOADING' || phaseState === 'UPLOADED') && (
                    <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${uploadItem.progress}%` }} />
                    </div>
                  )}
                </div>
                {phaseState === 'FAILED' && (
                  <button
                    type="button"
                    onClick={() => { setUploadItem(null); fileInputRef.current?.click(); }}
                    className="text-[10px] font-semibold text-rose-600 hover:underline shrink-0"
                  >
                    {isRtl ? 'تلاش دوباره' : 'Retry'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button variant="outline" size="sm" onClick={onClose}>
            {isRtl ? 'انصراف' : 'Cancel'}
          </Button>
          {tab === 'documents' && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirm}
              disabled={!selectedId}
              leftIcon={<Paperclip className="w-3.5 h-3.5" />}
            >
              {isRtl ? 'پیوست به پیام' : 'Attach'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};