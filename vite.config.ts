import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        // Node built-ins can never run in the browser — externalize them so Vite
        // stops trying to resolve server-side modules (silences ~80 warnings).
        external: [
          /^node:.*/,
          'fs', 'path', 'os', 'crypto', 'net', 'http', 'https',
          'stream', 'util', 'zlib', 'url', 'assert', 'buffer',
          'tty', 'querystring', 'async_hooks', 'tls',
        ],
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-ui': ['lucide-react', 'motion', 'clsx', 'tailwind-merge'],
            'vendor-utils': ['jalaali-js', 'xlsx', 'html-to-image', 'html2canvas'],
            'vendor-server': ['express', 'archiver', 'web-push', 'dotenv'],
            'vendor-ai': ['@google/genai'],
          },
        },
      },
      chunkSizeWarningLimit: 1500,
    },
    server: {
      // HMR is OFF by default. It only helps during local dev; on the HTTPS
      // panel host (panel.mobilemeisam.ir) the Vite client upgrades the socket
      // to wss:// while Vite's HMR server listens on plaintext ws://, so the
      // protocol mismatch is rejected and the console fills with
      // "WebSocket connection to wss://...:24678 failed / closed without opened".
      // Re-enable locally with DISABLE_HMR=false.
      hmr: process.env.DISABLE_HMR === 'false',
      // Disable file watching when HMR is off to save CPU during agent edits.
      watch: process.env.DISABLE_HMR !== 'false' ? null : {},
      // Allow serving on these hostnames (panel deployment domains)
      allowedHosts: [
        'panel.johannapage.website',
        'panel.mobilemeisam.ir',
      ],
    },
  };
});
