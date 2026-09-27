// BrandConfig foundation (P1, spec §9): white-label-ready shape without the
// full admin UI. All brand-dependent chrome reads from here so a future
// Commercial panel only needs to write a new config.
export interface BrandConfig {
  productName: string;
  organizationName?: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  accentColor?: string;
  fontFamily?: string;
  loginBranding?: string;
  reportBranding?: string;
}

export const DEFAULT_BRAND: BrandConfig = {
  productName: 'MMBA',
  organizationName: 'سامانه مدیریت یکپارچه مشتریان و عملیات',
  logoUrl: '/logo.svg',
  faviconUrl: '/icon.svg',
  primaryColor: '#4338ca',
  accentColor: '#0d9488',
  fontFamily: '',
  loginBranding: 'MMBA Business Operating System',
  reportBranding: 'MMBA',
};

const KEY = 'mmba_brand';

export function getBrand(): BrandConfig {
  if (typeof window === 'undefined') return DEFAULT_BRAND;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_BRAND, ...parsed };
    }
  } catch {}
  return DEFAULT_BRAND;
}

export function setBrand(brand: BrandConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...DEFAULT_BRAND, ...brand }));
  } catch {}
}

export function applyBrandToDom(brand?: BrandConfig): void {
  if (typeof document === 'undefined') return;
  const b = brand || getBrand();
  const root = document.documentElement;

  // Primary color replaceable (spec §3.1)
  root.style.setProperty('--color-primary', b.primaryColor);
  root.style.setProperty('--accent-primary', b.primaryColor);
  if (b.accentColor) root.style.setProperty('--color-accent', b.accentColor);
  if (b.fontFamily) root.style.setProperty('--font-brand', b.fontFamily);

  if (b.productName && document.title.indexOf(b.productName) === -1) {
    document.title = b.productName;
  }

  let favicon = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }
  if (b.faviconUrl) favicon.href = b.faviconUrl;
}