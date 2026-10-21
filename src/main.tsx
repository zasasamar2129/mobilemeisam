import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { getInitialTheme, applyTheme } from './lib/theme';
import { initAppearance } from './lib/themeEngine';
import { getBrand, applyBrandToDom } from './lib/brand';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Initialize and apply persistent theme mode on load
applyTheme(getInitialTheme());
initAppearance();
applyBrandToDom(getBrand());

// Register Service Worker for push notifications and offline background sync
if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'test') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

// Enable proxy for WordPress sync
(window as any).__MMBA_PROXY__ = true;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

