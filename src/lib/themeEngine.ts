import { applyTheme as applyModeTheme } from './theme';

export type ThemeProto = 'cleanLight' | 'editorial' | 'darkPremium';
export type BackgroundOption = 'solid' | 'softGradient' | 'grid' | 'paper';

const THEME_PROTO_KEY = 'mmba_theme_proto';
const BACKGROUND_KEY = 'mmba_background';

export function getThemeProto(): ThemeProto {
  if (typeof window === 'undefined') return 'cleanLight';
  try {
    const saved = localStorage.getItem(THEME_PROTO_KEY) as ThemeProto | null;
    if (saved === 'cleanLight' || saved === 'editorial' || saved === 'darkPremium') return saved;
  } catch {}
  return 'cleanLight';
}

export function getBackgroundOption(): BackgroundOption {
  if (typeof window === 'undefined') return 'solid';
  try {
    const saved = localStorage.getItem(BACKGROUND_KEY) as BackgroundOption | null;
    if (saved === 'solid' || saved === 'softGradient' || saved === 'grid' || saved === 'paper') return saved;
  } catch {}
  return 'solid';
}

export function applyThemeProto(proto: ThemeProto): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', proto);
  // darkPremium forces dark mode; cleanLight/editorial stay as the user's mode
  if (proto === 'darkPremium') {
    applyModeTheme('dark');
  } else {
    try {
      const savedMode = localStorage.getItem('mmba_theme');
      applyModeTheme(savedMode === 'dark' ? 'dark' : 'light');
    } catch {
      applyModeTheme('light');
    }
  }
  try {
    localStorage.setItem(THEME_PROTO_KEY, proto);
  } catch {}
  window.dispatchEvent(new CustomEvent('mmba-theme-proto-change', { detail: { proto } }));
}

export function applyBackground(option: BackgroundOption): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-bg', option);
  try {
    localStorage.setItem(BACKGROUND_KEY, option);
  } catch {}
  window.dispatchEvent(new CustomEvent('mmba-background-change', { detail: { option } }));
}

export function initAppearance(): void {
  applyThemeProto(getThemeProto());
  applyBackground(getBackgroundOption());
}