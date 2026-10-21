import { SimCard, WebsiteListingStatus } from '../types';
import { storage } from './storage';

export interface WebsiteSimPayload {
  public_id: string;
  version: number;
  listing_status: string;
  phone_number: string;
  operator: string;
  sale_price: number;
  rond_type_1: string;
  rond_type_2: string;
  updated_at: string;
}

export interface SyncResult {
  success: boolean;
  errorCode?: string;
  message: string;
}

/**
 * Strict allowlist mapper. Only these fields ever leave MMBA — they match the
 * ACF field names configured on the AVALSIM WordPress template exactly.
 */
export function toWebsiteSimPayload(sim: SimCard): WebsiteSimPayload {
  return {
    public_id: sim.websitePublicId || sim.id,
    version: (sim.websiteSyncVersion || 0) + 1,
    listing_status: sim.websiteListingStatus || WebsiteListingStatus.PUBLISHED,
    phone_number: sim.phoneNumber,
    operator: String(sim.operator),
    sale_price: Number(sim.salePrice) || 0,
    rond_type_1: sim.isRound ? (sim.roundCategory || 'رند') : 'عادی',
    rond_type_2: sim.category || 'NORMAL',
    updated_at: new Date().toISOString(),
  };
}

/** Pre-flight checks — mirrors the WordPress plugin's server-side validation. */
export function validateForPublication(sim: SimCard): string | null {
  if (!/^09\d{9}$/.test(sim.phoneNumber || '')) return 'INVALID_PHONE';
  if (!sim.salePrice || Number(sim.salePrice) <= 0) return 'INVALID_SALE_PRICE';
  if (!['AVAILABLE', 'IN_STOCK'].includes(String(sim.status))) return 'NOT_AVAILABLE';
  return null;
}

async function signedFetch(
  settings: { apiUrl: string; syncSecret: string; timeoutMs: number },
  path: string,
  method: string,
  body: object | null
): Promise<{ status: number; data: any }> {
  // HMAC-SHA256 over `timestamp.nonce.body` — must match src/Auth.php in the plugin.
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const bodyStr = body ? JSON.stringify(body) : '';
  const message = `${timestamp}.${nonce}.${bodyStr}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(settings.syncSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const signature = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs || 10000);

  // Route through the MMBA same-origin proxy (/api/wordpress) so the panel
  // never makes a cross-origin fetch to the WordPress host (CORS 403).
  // We force proxy usage for the production domain.
  const isProduction = settings.apiUrl.includes('avalsim.ir');
  const useProxy = isProduction || (typeof window !== 'undefined' && (window as any).__MMBA_PROXY__);

  try {
    const target = useProxy ? `/api/wordpress${path}` : `${settings.apiUrl.replace(/\/$/, '')}${path}`;
    const res = await fetch(target, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-AVALSIM-Signature': signature,
        'X-AVALSIM-Timestamp': timestamp,
        'X-AVALSIM-Nonce': nonce,
      },
      body: body ? bodyStr : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeErrorCode(status: number, code?: string): string {
  if (code) return String(code).toUpperCase();
  if (status === 401 || status === 403) return 'AUTH_FAILED';
  if (status === 409) return 'STALE_VERSION';
  if (status === 400) return 'VALIDATION_FAILED';
  if (status >= 500) return 'REMOTE_ERROR';
  return 'UNKNOWN_ERROR';
}

export async function testConnection(): Promise<SyncResult> {
  const settings = storage.getWordpressSyncSettings();
  if (!settings.apiUrl) return { success: false, message: 'آدرس سایت وارد نشده است.' };

  const isProduction = settings.apiUrl.includes('avalsim.ir');
  const useProxy = isProduction || (typeof window !== 'undefined' && (window as any).__MMBA_PROXY__);

  const cleanBase = settings.apiUrl.replace(/\/+$/, '');
  const healthUrl = useProxy ? '/api/wordpress/health' : (cleanBase.endsWith('/health') ? cleanBase : `${cleanBase}/health`);

  try {
    const res = await fetch(healthUrl, { method: 'GET' });
    if (res.ok) return { success: true, message: 'ارتباط با وب‌سایت اول سیم با موفقیت برقرار شد.' };
    return { success: false, message: `پاسخ نامعتبر از سایت (کد خطای ${res.status})` };
  } catch (err: any) {
    return { success: false, message: `عدم دسترسی به وب‌سایت. اتصال اینترنت یا آدرس را بررسی کنید (${err.message || 'شبکه'})` };
  }
}

/** Publish or update a SIM listing on the website. Never throws. */
export async function publishSim(sim: SimCard): Promise<SyncResult> {
  const settings = storage.getWordpressSyncSettings();
  if (!settings.enabled) {
    return { success: false, errorCode: 'SYNC_DISABLED', message: 'همگام‌سازی غیرفعال است.' };
  }
  if (!settings.apiUrl || !settings.syncSecret) {
    return { success: false, errorCode: 'NOT_CONFIGURED', message: 'تنظیمات همگام‌سازی کامل نیست.' };
  }

  const invalid = validateForPublication(sim);
  if (invalid) return { success: false, errorCode: invalid, message: 'این شماره شرایط انتشار را ندارد.' };

  try {
    const { status, data } = await signedFetch(settings, '/sims', 'POST', toWebsiteSimPayload(sim));
    if (status >= 200 && status < 300) {
      return { success: true, message: 'انتشار با موفقیت انجام شد.' };
    }
    return {
      success: false,
      errorCode: normalizeErrorCode(status, data?.code),
      message: data?.message || 'خطا در انتشار',
    };
  } catch {
    // Network/timeout — retryable. Local inventory is unaffected either way.
    return { success: false, errorCode: 'NETWORK_ERROR', message: 'عدم دسترسی به وب‌سایت. تلاش مجدد لازم است.' };
  }
}

/**
 * Update only the public display fields of an already-published listing.
 *
 * Separate from `publishSim` because the catalogue panel does not deal in
 * prices: it edits the two ACF rond fields and nothing else. Sale price keeps
 * whatever value WordPress already holds.
 */
export async function updateSimDisplayFields(params: {
  publicId: string;
  version: number;
  phoneNumber: string;
  rondType1: string;
  rondType2: string;
  listingStatus?: string;
}): Promise<SyncResult> {
  const settings = storage.getWordpressSyncSettings();
  if (!settings.enabled) {
    return { success: false, errorCode: 'SYNC_DISABLED', message: 'همگام‌سازی غیرفعال است.' };
  }
  if (!settings.apiUrl || !settings.syncSecret) {
    return { success: false, errorCode: 'NOT_CONFIGURED', message: 'تنظیمات همگام‌سازی کامل نیست.' };
  }
  if (!/^09\d{9}$/.test(params.phoneNumber || '')) {
    return { success: false, errorCode: 'INVALID_PHONE', message: 'شماره خط معتبر نیست.' };
  }

  try {
    const { status, data } = await signedFetch(settings, '/sims', 'POST', {
      public_id: params.publicId,
      version: (params.version || 0) + 1,
      listing_status: params.listingStatus || 'PUBLISHED',
      phone_number: params.phoneNumber,
      rond_type_1: params.rondType1,
      rond_type_2: params.rondType2,
      updated_at: new Date().toISOString(),
    });
    if (status >= 200 && status < 300) {
      return { success: true, message: 'تغییرات با موفقیت در وردپرس اعمال شد.' };
    }
    return {
      success: false,
      errorCode: normalizeErrorCode(status, data?.code),
      message: data?.message || 'خطا در بروزرسانی',
    };
  } catch {
    return { success: false, errorCode: 'NETWORK_ERROR', message: 'عدم دسترسی به وب‌سایت. تلاش مجدد لازم است.' };
  }
}

/** Withdraw a listing. Keeps the internal SIM record intact. */
export async function withdrawSim(sim: SimCard): Promise<SyncResult> {
  const settings = storage.getWordpressSyncSettings();
  if (!settings.enabled) {
    return { success: false, errorCode: 'SYNC_DISABLED', message: 'همگام‌سازی غیرفعال است.' };
  }
  const publicId = sim.websitePublicId || sim.id;

  try {
    const { status, data } = await signedFetch(settings, `/sims/${encodeURIComponent(publicId)}`, 'DELETE', null);
    if (status >= 200 && status < 300) return { success: true, message: 'لغو انتشار انجام شد.' };
    if (status === 404) return { success: true, message: 'این شماره روی سایت ثبت نشده بود.' };
    return {
      success: false,
      errorCode: normalizeErrorCode(status, data?.code),
      message: data?.message || 'خطا در لغو انتشار',
    };
  } catch {
    return { success: false, errorCode: 'NETWORK_ERROR', message: 'عدم دسترسی به وب‌سایت. تلاش مجدد لازم است.' };
  }
}

/** Fetch live SIM listings directly from the WordPress REST API endpoint. */
export async function fetchSimsFromWordpress(): Promise<{ success: boolean; sims: any[]; message?: string }> {
  const settings = storage.getWordpressSyncSettings();
  if (!settings.apiUrl) {
    return { success: false, sims: [], message: 'آدرس پایه وردپرس تنظیم نشده است.' };
  }

  // 1. First, try our plugin's authenticated custom endpoint /avalsim/v1/sims
  // This reads directly from post_meta, bypassing any ACF REST exposure issues
  try {
    const { status, data } = await signedFetch(settings, '/sims', 'GET', null);
    if (status >= 200 && status < 300 && data && data.success && Array.isArray(data.sims)) {
      return { success: true, sims: data.sims };
    }
  } catch {
    // Fall back to native WP REST API if plugin endpoint fails or signature not ready
  }

  // 2. Fallback: WordPress native REST endpoint for custom post type `sim_card`
  const wpBase = settings.apiUrl.replace(/\/wp-json\/.*$/, '') + '/wp-json/wp/v2/sim_cards?per_page=100';

  try {
    const res = await fetch(wpBase, { method: 'GET' });
    if (!res.ok) {
      return { success: false, sims: [], message: `خطا در دریافت اطلاعات از وردپرس (HTTP ${res.status})` };
    }
    const data = await res.json();
    // Parse WP posts into a clean format
    const sims = (Array.isArray(data) ? data : []).map((post: any) => ({
      id: post.id,
      title: post.title?.rendered || '',
      status: post.status, // publish, private, draft
      link: post.link,
      // ACF fields exposed via WP REST API
      phone_number: post.acf?.phone_number || post.title?.rendered || '',
      rond_type_1: post.acf?.rond_type_1 || '',
      rond_type_2: post.acf?.rond_type_2 || '',
      sale_price: post.acf?.sale_price || 0,
      public_id: post.acf?._mmba_public_id || '',
      version: post.acf?._mmba_version || 1,
      listing_status: post.acf?.listing_status || 'PUBLISHED',
      modified: post.modified_gmt || post.date_gmt,
    }));
    return { success: true, sims };
  } catch (err: any) {
    return { success: false, sims: [], message: err.message || 'خطای شبکه در اتصال به وردپرس' };
  }
}

