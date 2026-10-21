/**
 * MMBA — File Upload hardening (Patch): shared upload state machine + validation.
 *
 * Key principle: `100%` means bytes transfer finished — a file is only READY once
 * the backend has confirmed the stored Document record (server-confirmed completion).
 *
 * Phases map to the backend states in the Patch spec:
 *   SELECTED → VALIDATING → UPLOADING → UPLOADED → PROCESSING → READY
 *   any state → FAILED (retryable) | CANCELLED
 */

/** Global cap for a single uploaded file. Kept at 10MB to match historical UI text. */
export const MAX_UPLOAD_SIZE_MB = 10;
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

/** Client-side extension whitelist (server re-validates independently — §8). */
export const ALLOWED_UPLOAD_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif', 'bmp', 'tiff', 'tif', 'svg',
  'pdf', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'zip',
  'mp3', 'mp4', 'm4a', 'ogg', 'webm', 'wav',
];

/** Extension → MIME. Mobile browsers report wrong/empty types for HEIC/PNG, so the
 *  extension-backed type wins over `File.type` for known formats (§14 Test Note). */
export const EXTENSION_MIME: Record<string, string> = {
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  svg: 'image/svg+xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  wav: 'audio/wav',
};

export type UploadPhase =
  | 'SELECTED'
  | 'VALIDATING'
  | 'UPLOADING'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'CANCELLED';

export interface UploadItem {
  /** Idempotency key: customerId::name::size::lastModified (§9). */
  key: string;
  /** Backend Document id — set only after server confirmation. */
  id?: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  mimeType?: string;
  sha256?: string;
  /** Base64 bytes persisted to IndexedDB so retries / app-switch recover (§14). */
  dataUrl?: string;
  phase: UploadPhase;
  /** 0–99 while transferring; only ever 100 when bytes are done (§4). */
  progress: number;
  /** Human/actionable error (Persian = RTL, English = LTR) (§19). */
  error?: string;
  canRetry: boolean;
  createdAt: string;
}

export interface UploadValidationResult {
  ok: boolean;
  /** User-facing reason when ok === false. */
  error?: string;
  fileType?: string;
}

/** Real validation BEFORE the upload layer (§8). Server re-validates. */
export function validateUploadFile(file: File, maxBytes = MAX_UPLOAD_SIZE_BYTES): UploadValidationResult {
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  if (file.size === 0) {
    return { ok: false, error: 'فایل خالی است / File is empty' };
  }
  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) {
    return { ok: false, error: `پسوند .${ext} پشتیبانی نمی‌شود / Extension .${ext} is not allowed` };
  }
  if (file.size > maxBytes) {
    return { ok: false, error: `حجم فایل بیش از حد مجاز ${maxBytes / (1024 * 1024)}MB است / File exceeds the ${maxBytes / (1024 * 1024)}MB limit` };
  }

  const fileType = EXTENSION_MIME[ext] || file.type || 'application/octet-stream';
  return { ok: true, fileType };
}

/** Idempotency key — §9 (deduping across retries & restarts). */
export function makeUploadKey(customerId: string | undefined, file: File): string {
  return `${customerId || 'general'}::${file.name}::${file.size}::${file.lastModified || 0}`;
}

/** Actionable, scoped error copy (§19). */
export function uploadErrorMessage(codeOrText: string, fileName: string): string {
  let ru = 'بارگذاری فایل انجام نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.';
  let en = 'Upload failed. Check your internet connection and try again.';
  if (codeOrText === 'duplicate') {
    ru = 'این فایل قبلاً بارگذاری شده است. از لیست اسناد انتخاب کنید.';
    en = 'This file has already been uploaded. Pick it from the document list.';
  } else if (codeOrText === 'cancel') {
    ru = 'بارگذاری لغو شد.';
    en = 'Upload cancelled.';
  } else if (codeOrText === 'timeout') {
    ru = 'مدت زمان بارگذاری زیاد شد. اتصال را بررسی و دوباره تلاش کنید.';
    en = 'Upload timed out. Check your connection and retry.';
  }
  return `${ru} — ${en} (${fileName})`;
}