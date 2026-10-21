import { Router, Request, Response } from 'express';
import { centralDb } from './db';

export const wordpressProxy = Router();

function settings() {
  return centralDb.getWordpressSyncSettings();
}

function buildHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  for (const h of ['x-avalsim-signature', 'x-avalsim-timestamp', 'x-avalsim-nonce']) {
    const v = req.header(h);
    if (v) headers[h] = v;
  }
  return headers;
}

wordpressProxy.get('/health', async (req: Request, res: Response) => {
  const s = settings();
  if (!s?.apiUrl) return res.status(400).json({ success: false, message: 'آدرس وردپرس تنظیم نشده است.' });
  try {
    const upstream = await fetch(`${s.apiUrl.replace(/\/+$/, '')}/health`, { method: 'GET' });
    const data = await upstream.json().catch(() => ({}));
    res.json({ status: upstream.status, data });
  } catch (err: any) {
    res.status(502).json({ success: false, message: 'عدم دسترسی به وب‌سایت.' });
  }
});

wordpressProxy.get('/sims', async (req: Request, res: Response) => {
  const s = settings();
  if (!s?.apiUrl) return res.status(400).json({ success: false, message: 'آدرس وردپرس تنظیم نشده است.' });
  try {
    const upstream = await fetch(`${s.apiUrl.replace(/\/+$/, '')}/sims`, {
      method: 'GET',
      headers: buildHeaders(req),
    });
    const data = await upstream.json().catch(() => ({}));
    res.json({ status: upstream.status, data });
  } catch (err: any) {
    res.status(502).json({ success: false, message: 'عدم دسترسی به وب‌سایت.' });
  }
});

wordpressProxy.post('/sims', async (req: Request, res: Response) => {
  const s = settings();
  if (!s?.apiUrl) return res.status(400).json({ success: false, message: 'آدرس وردپرس تنظیم نشده است.' });
  try {
    const upstream = await fetch(`${s.apiUrl.replace(/\/+$/, '')}/sims`, {
      method: 'POST',
      headers: buildHeaders(req),
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json().catch(() => ({}));
    res.json({ status: upstream.status, data });
  } catch (err: any) {
    res.status(502).json({ success: false, message: 'عدم دسترسی به وب‌سایت.' });
  }
});

wordpressProxy.put('/settings', async (req: Request, res: Response) => {
  try {
    const updated = await centralDb.saveWordpressSyncSettings(req.body);
    res.json({ success: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

wordpressProxy.get('/settings', (req: Request, res: Response) => {
  res.json({ success: true, settings: centralDb.getWordpressSyncSettings() });
});
