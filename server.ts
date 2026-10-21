import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/routes';
import { notificationScheduler } from './server/notificationScheduler';
import { wordpressProxy } from './server/wordpressProxy';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Body parsers with generous payload limits for receipts/attachments/voice
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // Basic CORS & Security Headers
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // WordPress catalogue proxy — forwards signed requests server-side so the
  // panel never makes a cross-origin fetch to the WordPress host.
  app.use('/api/wordpress', wordpressProxy);

  // Mount Centralized MMBA API Router FIRST
  app.use('/api/v1', apiRouter);
  app.use('/api', apiRouter);

  // Vite middleware for development or Static files for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          // The app persists every mutation to data/*.json (presence heartbeats,
          // read receipts, chat). Without this Vite sees each write as a change
          // and full-reloads the page every few seconds. Server-side files are
          // picked up by tsx, so there is nothing to gain from watching them here.
          ignored: ['**/data/**', '**/dist/**', '**/node_modules/**'],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[MMBA Server] Centralized Production Engine running on http://0.0.0.0:${PORT}`);
    notificationScheduler.start(15000);
  });
}

startServer().catch((err) => {
  console.error('[MMBA Server] Startup error:', err);
});
