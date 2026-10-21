/**
 * MMBA — Upload Manager (Patch §3, §4).
 *
 * Every upload (Device / Documents / Drag&Drop / Chat) flows through this single
 * manager. It owns the upload state machine and guarantees:
 *   - progress reflects real byte transfer (FileReader read), never a fake 100%,
 *   - the SUCCESS/READY transition happens ONLY after the backend confirms,
 *   - retries are idempotent (same SHA-256 → no duplicate Document, §9),
 *   - file data is persisted to IndexedDB so it survives a mobile app switch /
 *     lock / reload until the server confirms (§14).
 *
 * Endpoints (§21, `idempotent original`): the existing POST /api/attachments with
 * `{ id, idempotencyKey, sha256, dataUrl, ... }` is the upload+create + status
 * refresh in one; `idempotencyKey` + `sha256` are the ownership conflict guard.
 */
import { Attachment } from '../types';
import {
  api as apiClient,
} from '../services/api';
import {
  idbStorage,
} from './idbStorage';
import {
  UploadItem, UploadPhase, MAX_UPLOAD_SIZE_MB,
} from './uploadTypes';

export type UploadCallbacks = {
  onChange?: (item: UploadItem) => void;
};

export interface UploadInput {
  file: File;
  /** Backend Document id to preserve across a retry, when one exists. */
  id?: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  mimeType?: string;
  sha256?: string;
  key: string;
  dataUrl: string;
  category?: string;
  customerId?: string;
  customerName?: string;
  uploadedByUserId: string;
  uploadedByUserName: string;
}

export interface UploadResult {
  ok: boolean;
  id?: string;
  sha256?: string;
  /** 'duplicate' | 'cancelled' | 'timeout' | any error code. */
  code?: string;
  message?: string;
}

const IDB_KEY_PREFIX = 'pending_upload_';

function rewriteDataUrlHeader(dataUrl: string, fileType: string): string {
  if (!dataUrl.startsWith('data:')) return dataUrl;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx <= 5) return dataUrl;
  const headerPart = dataUrl.substring(5, commaIdx);
  const browserMime = headerPart.split(';')[0];
  if (browserMime && browserMime !== fileType) {
    return `data:${fileType}${headerPart.substring(browserMime.length)}${dataUrl.substring(commaIdx)}`;
  }
  return dataUrl;
}

export class UploadManager {
  private listeners = new Set<UploadCallbacks>();

  /** Subscribe to every upload state change (documents list, chat composer…). */
  public subscribe(cb: UploadCallbacks): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Legacy single-slot setter, kept for callers that don't need multi-listener. */
  public setCallbacks(cb: UploadCallbacks): () => void {
    return this.subscribe(cb);
  }

  private notify(item: UploadItem): void {
    this.listeners.forEach((l) => l.onChange?.(item));
  }

  private isRetryableError(err: any): boolean {
    return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private mark(item: UploadItem, patch: Partial<UploadItem>): UploadItem {
    const next = { ...item, ...patch };
    this.notify(next);
    return next;
  }

  private async persistForRecovery(item: UploadItem): Promise<void> {
    try {
      // Keep the raw bytes so a Retry can re-upload without re-picking the file.
      await idbStorage.set(`${IDB_KEY_PREFIX}${item.key}`, { ...item, dataUrl: item.dataUrl || '' });
    } catch (e) {
      console.warn('[UploadManager] could not persist pending upload:', e);
    }
  }

  /** Background-recover any upload left pending by a previous session (§14). */
  public async recoverPending(upload: (item: UploadItem) => Promise<void>): Promise<void> {
    try {
      let keys: string[] = [];
      try {
        keys = await idbStorage.getAllKeys?.(IDB_KEY_PREFIX) || [];
      } catch {
        keys = [];
      }
      for (const k of keys) {
        const item = await idbStorage.get<UploadItem>(k);
        if (item && ['UPLOADING', 'UPLOADED', 'PROCESSING'].includes(item.phase)) {
          item.phase = 'SELECTED';
          item.canRetry = true;
          await idbStorage.set(`${IDB_KEY_PREFIX}${item.key}`, item);
          void upload(item);
        } else if (item) {
          await idbStorage.delete(`${IDB_KEY_PREFIX}${item.key}`);
        }
      }
    } catch (e) {
      console.warn('[UploadManager] recoverPending failed:', e);
    }
  }

  /**
   * Bytes → validated → server-confirmed.
   * Resolves { ok:true, id, sha256 } only when the backend acknowledged the
   * persisted Document (response revision is a side input for cache coherency).
   */
  public async upload(input: UploadInput): Promise<UploadResult> {
    if (input.fileSize > MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
      return { ok: false, message: `فایل بیش از ${MAX_UPLOAD_SIZE_MB}MB است / File exceeds ${MAX_UPLOAD_SIZE_MB}MB` };
    }
    const sha256 = input.sha256 || '';
    if (!sha256) {
      return { ok: false, message: 'هش فایل محاسبه نشد / failed to hash file' };
    }

    const item: UploadItem = {
      key: input.key,
      id: input.id,
      fileName: input.fileName,
      fileSize: input.fileSize,
      fileType: input.fileType,
      mimeType: input.mimeType || input.fileType,
      sha256,
      dataUrl: input.dataUrl,
      phase: 'UPLOADING',
      progress: 0,
      canRetry: false,
      createdAt: new Date().toISOString(),
    };
    this.notify(item);

    // Phase: UPLOADING — transfer bytes (FileReader read, NOT network).
    let dataUrl = input.dataUrl;
    let transferProgress = input.fileSize > 0 ? 0 : 100;
    if (input.file.size > 0 && !input.dataUrl) {
      try {
        dataUrl = await readFileAsDataUrl(input.file, (pct) => {
          item.progress = pct;
          this.mark(item, { progress: pct });
        });
      } catch {
        const failed = this.mark(item, { phase: 'FAILED', canRetry: true, error: 'خطا در خواندن فایل' });
        return { ok: false, code: 'read', message: failed.error || 'read failed' };
      }
      // Cancel after read: nothing was sent yet.
      if (item.phase === 'CANCELLED') {
        return { ok: false, code: 'cancelled', message: 'cancelled' };
      }
    }
    const fixedDataUrl = rewriteDataUrlHeader(dataUrl, renderableType(input.fileType, input.fileName));

    // Phase: UPLOADED — server-confirmed network POST (persist-safe recovery data first).
    const persisted = this.mark(item, { phase: 'UPLOADING', progress: transferProgress, canRetry: false });
    await this.persistForRecovery(persisted);

    const attachment: Attachment = {
      id: input.id || '',
      fileName: input.fileName,
      originalName: input.fileName,
      displayName: input.fileName,
      fileType: renderableType(input.fileType, input.fileName),
      mimeType: input.fileType,
      fileSize: input.fileSize,
      dataUrl: fixedDataUrl,
      sha256,
      idempotencyKey: input.key,
      uploadStatus: 'PROCESSING',
      category: input.category,
      customerId: input.customerId,
      customerName: input.customerName,
      uploadedByUserId: input.uploadedByUserId,
      uploadedByUserName: input.uploadedByUserName,
    };

    try {
      // Phase: UPLOADED — server-confirmed HTTP request with REAL network progress (with retry).
      let res: any;
      let attempt = 1;
      const maxAttempts = 3;
      while (true) {
        try {
          res = await apiClient.uploadAttachment(
            attachment,
            (pct) => {
              this.mark(item, { phase: 'UPLOADING', progress: Math.min(pct, 99) });
            }
          );
          break;
        } catch (err: any) {
          if (attempt < maxAttempts && this.isRetryableError(err) && item.phase !== 'CANCELLED') {
            attempt++;
            const backoff = Math.min(1000 * Math.pow(2, attempt - 2), 10000);
            this.mark(item, { phase: 'UPLOADING', error: `تلاش مجدد (${attempt}/${maxAttempts})...` });
            await this.delay(backoff);
            continue;
          }
          throw err;
        }
      }
      const confirmedId = res?.attachment?.id || attachment.id || input.id;
      if (!confirmedId) {
        const f = this.mark(item, { phase: 'FAILED', canRetry: true, error: 'سرور شناسه سند را برنگرداند / server returned no document id' });
        return { ok: false, code: 'empty-id', message: f.error || 'no document id' };
      }

      // Server IFF success — replace any temp id on the record.
      if (attachment.id && attachment.id !== confirmedId) {
        await apiClient.updateAttachmentThumbnail(confirmedId, '', 'PROCESSED').catch(() => {});
      }

      // Phase: UPLOADED → READY (server has confirmed bytes + record).
      const ready = this.mark(item, { id: confirmedId, phase: 'READY', progress: 100, canRetry: false });
      await this.persistForRecovery(ready);
      try {
        await idbStorage.delete(`${IDB_KEY_PREFIX}${item.key}`).catch(() => {});
      } catch { /* non-fatal */ }

      return { ok: true, id: confirmedId, sha256 };
    } catch (err: any) {
      // Duplicate guard feedback from the server (409/400 idempotency mismatch).
      const dup = err?.status === 409 || /duplicate|already exist|تکراری|وجود/i.test(err?.message || '');
      const cancelled = item.phase === 'CANCELLED';
      const timedOut = !cancelled && /timeout|abort|aborted/i.test(err?.message || '');
      const failed = this.mark(item, {
        phase: 'FAILED',
        canRetry: !cancelled,
        error: cancelled ? 'لغو / cancelled' : (dup ? 'فایل تکراری / duplicate' : (err?.message || 'upload failed')),
      });
      if (!cancelled) await this.persistForRecovery(failed);
      if (cancelled) return { ok: false, code: 'cancelled', message: 'cancelled' };
      return { ok: false, code: dup ? 'duplicate' : (timedOut ? 'timeout' : 'error'), message: failed.error || 'upload failed' };
    }
  }

  /** §9 — retry a FAILED upload from its persisted bytes (bytes never re-picked
   *  from disk, so the same idempotency key / sha256 are reused automatically and
   *  a repeated POST cannot create a duplicate Document). */
  public async retry(item: UploadItem, ctx: {
    dataUrl?: string;
    category?: string;
    customerId?: string;
    customerName?: string;
    uploadedByUserId: string;
    uploadedByUserName: string;
  }): Promise<UploadResult> {
    const bytes = item.dataUrl || ctx.dataUrl || '';
    if (!bytes || !item.sha256) {
      return { ok: false, code: 'error', message: 'اطلاعات فایل برای تلاش دوباره در دسترس نیست / file data unavailable for retry' };
    }
    const itemRetry: UploadItem = { ...item, phase: 'SELECTED', progress: 0, error: undefined, canRetry: false, dataUrl: bytes };
    this.notify(itemRetry);
    const att: Attachment = {
      id: item.id || '',
      fileName: item.fileName,
      originalName: item.fileName,
      displayName: item.fileName,
      fileType: item.fileType,
      mimeType: item.mimeType || item.fileType,
      fileSize: item.fileSize,
      dataUrl: bytes,
      sha256: item.sha256,
      idempotencyKey: item.key,
      uploadStatus: 'PROCESSING',
      category: ctx.category,
      customerId: ctx.customerId,
      customerName: ctx.customerName,
      uploadedByUserId: ctx.uploadedByUserId,
      uploadedByUserName: ctx.uploadedByUserName,
    };
    try {
      const res = await apiClient.uploadAttachment(att, (pct) => {
        this.mark(itemRetry, { phase: 'UPLOADING', progress: Math.min(pct, 99) });
      });
      const confirmedId = res?.attachment?.id || item.id;
      if (!confirmedId) {
        return { ok: false, code: 'empty-id', message: 'no document id' };
      }
      this.mark(itemRetry, { id: confirmedId, phase: 'READY', progress: 100, canRetry: false });
      await idbStorage.delete(`${IDB_KEY_PREFIX}${item.key}`).catch(() => {});
      return { ok: true, id: confirmedId, sha256: item.sha256 };
    } catch (err: any) {
      const dup = err?.status === 409 || /duplicate|already exist|تکراری|وجود/i.test(err?.message || '');
      this.mark(itemRetry, { phase: 'FAILED', canRetry: !dup, error: dup ? 'فایل تکراری / duplicate' : (err?.message || 'upload failed') });
      return { ok: false, code: dup ? 'duplicate' : 'error', message: dup ? 'duplicate' : (err?.message || 'upload failed') };
    }
  }

  /** Fairly-best-effort cancel: stops the transfer, no partial server record (§4). */
  public async cancel(item: UploadItem): Promise<void> {
    const next = this.mark(item, { phase: 'CANCELLED', canRetry: false });
    await idbStorage.delete(`${IDB_KEY_PREFIX}${item.key}`).catch(() => {});
    try {
      if (item.id) {
        await apiClient.deleteAttachment(item.id).catch(() => {});
      }
    } catch { /* non-fatal */ }
    void next;
  }
}

function renderableType(fileType: string, fileName: string): string {
  if (fileType && fileType !== 'application/octet-stream') return fileType;
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf', gif: 'image/gif',
    avif: 'image/avif', bmp: 'image/bmp', tiff: 'image/tiff', tif: 'image/tiff',
    svg: 'image/svg+xml'
  };
  return map[ext] || 'application/octet-stream';
}

function readFileAsDataUrl(file: File, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

export const uploadManager = new UploadManager();