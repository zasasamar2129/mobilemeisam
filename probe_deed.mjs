import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmba-probe-'));
process.env.DATABASE_PATH = path.join(tmp, 'db.json');
const { centralDb } = await import('./server/db.js');
const { apiRouter } = await import('./server/routes.js');
const { UserRole, UserStatus, SimStatus } = await import('./src/types/index.js');
const now = new Date().toISOString();
await centralDb.saveUser({ id: 'usr-admin', name: 'm', username: 'admin', role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE, createdAt: now });
const app = express();
app.use(express.json());
app.use('/api', apiRouter);
const s = http.createServer(app);
await new Promise((r) => s.listen(0, r));
const port = s.address().port;
const A = { Authorization: 'Bearer token-usr-admin', 'Content-Type': 'application/json' };
const DAY = 24 * 60 * 60 * 1000;
const d = (o) => new Date(Math.floor(Date.now() / DAY) * DAY + o * DAY).toISOString();
const r = await fetch(`http://127.0.0.1:${port}/api/sims`, {
  method: 'POST', headers: A,
  body: JSON.stringify({ id: 'sim-late', phoneNumber: '09120000002', status: SimStatus.AVAILABLE, previousTransferDate: d(-19), purchaseDate: d(0), deedTransferDueDate: d(40) }),
});
const body = await r.json();
console.log('status', r.status);
console.log('deedWarnings', JSON.stringify(body.deedWarnings));
console.log('deedEligibility', JSON.stringify(body.deedEligibility));
s.close();
setTimeout(() => process.exit(0), 200).unref();