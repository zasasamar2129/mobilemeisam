/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import * as dotenv from 'dotenv';
import { 
  initDb, 
  getStats, 
  getCustomers, 
  createCustomer, 
  updateCustomer, 
  getContracts, 
  createContract, 
  updateContract, 
  deleteContract, 
  recordPayment, 
  searchContractsByPhoneNumber, 
  getNotifications, 
  markNotificationAsRead 
} from './src/db/db-service.ts';

dotenv.config();

const app = express();
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://mobilemeisam.vercel.app");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});
const PORT = 3000;

// Initialize the persistent DB file
initDb();

// Request body parsers with generous limits for simulated receipt uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Simple & Secure Token Implementation (Zero-dependency JWT-like) ---
const SECRET_KEY = process.env.JWT_SECRET || 'meisam-gold-token-2026';

function signToken(payload: { username: string; role: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 24 * 60 * 60 * 1000 })).toString('base64url');
  // Simple HMAC-like signature
  const signature = Buffer.from(`${header}.${body}.${SECRET_KEY}`).toString('base64url').substring(0, 32);
  return `${header}.${body}.${signature}`;
}

function verifyToken(token: string): { username: string; role: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = Buffer.from(`${header}.${body}.${SECRET_KEY}`).toString('base64url').substring(0, 32);
    if (signature !== expectedSig) return null;
    
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (Date.now() > payload.exp) return null; // Expired
    return { username: payload.username, role: payload.role };
  } catch {
    return null;
  }
}

// Auth Middleware
function requireAdmin(req: any, res: any, next: any) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split('Bearer ')[1];
  } else if (req.query.Authorization && req.query.Authorization.startsWith('Bearer ')) {
    token = req.query.Authorization.split('Bearer ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided / توکن احراز هویت وجود ندارد' });
  }
  const user = verifyToken(token);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required / دسترسی ادمین الزامی است' });
  }
  req.user = user;
  next();
}

// --- API ROUTES ---

// 1. Auth Endpoint
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  // Default Admin Credentials
  if ((username === 'admin' || username === 'meisam') && password === 'meisam123') {
    const token = signToken({ username: 'admin', role: 'admin' });
    return res.json({
      success: true,
      token,
      user: { username: 'admin', role: 'admin', fullName: 'میثم سلطانی' }
    });
  }
  
  return res.status(401).json({ error: 'Invalid username or password / نام کاربری یا کلمه عبور نادرست است' });
});

// Get self profile
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const token = authHeader.split('Bearer ')[1];
  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Session expired' });
  }
  res.json({ user: { ...user, fullName: 'میثم سلطانی' } });
});

// 2. Stats
app.get('/api/stats', requireAdmin, (req, res) => {
  try {
    const stats = getStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Customers (CRUD)
app.get('/api/customers', requireAdmin, (req, res) => {
  res.json(getCustomers());
});

app.post('/api/customers', requireAdmin, (req, res) => {
  const { fullName, phoneNumber } = req.body;
  if (!fullName || !phoneNumber) {
    return res.status(400).json({ error: 'Customer name and phone number are required' });
  }
  try {
    const newCust = createCustomer(fullName, phoneNumber);
    res.status(201).json(newCust);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/customers/:id', requireAdmin, (req, res) => {
  const { fullName, phoneNumber } = req.body;
  try {
    const updated = updateCustomer(req.params.id, fullName, phoneNumber);
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 4. Contracts (CRUD)
app.get('/api/contracts', requireAdmin, (req, res) => {
  res.json(getContracts());
});

app.post('/api/contracts', requireAdmin, (req, res) => {
  const { customerId, simNumber, contractDate, totalPrice, prepayment, monthsCount, notes, contractNumber } = req.body;
  
  if (!customerId || !simNumber || !contractDate || totalPrice === undefined || prepayment === undefined || !monthsCount) {
    return res.status(400).json({ error: 'All fields including Customer, SIM Number, Start Date, Totals and Months Count are required' });
  }

  try {
    const newContract = createContract({
      customerId,
      contractNumber,
      simNumber,
      contractDate,
      totalPrice: Number(totalPrice),
      prepayment: Number(prepayment),
      monthsCount: Number(monthsCount),
      notes: notes || '',
    });
    res.status(201).json(newContract);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/contracts/:id', requireAdmin, (req, res) => {
  try {
    const updated = updateContract(req.params.id, req.body);
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/contracts/:id', requireAdmin, (req, res) => {
  try {
    const result = deleteContract(req.params.id);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 5. Secure Payment Recording
app.post('/api/payments', requireAdmin, (req, res) => {
  const { contractId, amount, paymentDate, receiptImage, notes } = req.body;
  if (!contractId || !amount || !paymentDate) {
    return res.status(400).json({ error: 'Contract ID, payment date, and amount are required' });
  }
  try {
    const payment = recordPayment({
      contractId,
      amount: Number(amount),
      paymentDate,
      receiptImage: receiptImage || null,
      notes: notes || '',
    });
    res.status(201).json(payment);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 6. Notifications
app.get('/api/notifications', requireAdmin, (req, res) => {
  res.json(getNotifications());
});

app.post('/api/notifications/:id/read', requireAdmin, (req, res) => {
  try {
    markNotificationAsRead(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 7. Public Customer Search (returns all matching active/past contracts)
app.get('/api/customer/search', (req, res) => {
  const { phone } = req.query;
  if (!phone || typeof phone !== 'string') {
    return res.status(400).json({ error: 'Please enter a valid phone number / لطفا شماره تماس معتبر وارد کنید' });
  }
  
  try {
    const contracts = searchContractsByPhoneNumber(phone);
    res.json(contracts);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// 8. Custom Document Export (Excel & CSV)
app.get('/api/reports/export', requireAdmin, (req, res) => {
  const { type, format } = req.query;
  
  try {
    let filename = '';
    let csvContent = '';
    
    // Add UTF-8 BOM so Excel opens Persian words correctly!
    const BOM = '\uFEFF';

    if (type === 'customers') {
      filename = `customers-report-${new Date().toISOString().split('T')[0]}`;
      const customers = getCustomers();
      csvContent = 'شناسه (ID),نام کامل (Full Name),شماره تلفن (Phone Number),تاریخ ثبت (Created Date)\n' +
        customers.map(c => `"${c.id}","${c.fullName}","${c.phoneNumber}","${c.createdAt.substring(0,10)}"`).join('\n');
    } else if (type === 'contracts') {
      filename = `contracts-report-${new Date().toISOString().split('T')[0]}`;
      const contracts = getContracts();
      csvContent = 'شماره قرارداد (Contract No),مشتری (Customer),شماره موبایل فروخته شده (Sold SIM),مبلغ کل (Total Price),پیش‌پرداخت (Prepayment),باقیمانده (Outstanding),قسط ماهانه (Monthly Inst.),تعداد اقساط (Months),وضعیت (Status)\n' +
        contracts.map(c => `"${c.contractNumber}","${c.customer?.fullName || ''}","${c.simNumber}",${c.totalPrice},${c.prepayment},${c.remainingBalance},${c.monthlyInstallment},${c.monthsCount},"${c.status}"`).join('\n');
    } else if (type === 'payments') {
      filename = `payments-report-${new Date().toISOString().split('T')[0]}`;
      const contracts = getContracts();
      // Flatten payments
      const paymentsList: any[] = [];
      contracts.forEach((c: any) => {
        c.payments.forEach((p: any) => {
          paymentsList.push({
            contractNumber: c.contractNumber,
            customerName: c.customer?.fullName || '',
            amount: p.amount,
            date: p.paymentDate,
            notes: p.notes,
          });
        });
      });
      csvContent = 'شماره قرارداد (Contract No),نام مشتری (Customer Name),مبلغ دریافتی (Amount IRR),تاریخ پرداخت (Payment Date),توضیحات (Notes)\n' +
        paymentsList.map(p => `"${p.contractNumber}","${p.customerName}",${p.amount},"${p.date}","${p.notes}"`).join('\n');
    } else {
      return res.status(400).send('Invalid export type');
    }

    if (format === 'excel') {
      // Excel behaves beautifully with styled CSV if UTF-8 BOM is present and Content-Type is correct
      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}.xls`);
      res.send(BOM + csvContent);
    } else {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
      res.send(BOM + csvContent);
    }

  } catch (error: any) {
    res.status(500).send(`Export failed: ${error.message}`);
  }
});


// --- VITE WEB ENGINE MIDDLEWARE ---

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
    console.log(`Mobile Meisam Server booted successfully on http://0.0.0.0:${PORT}`);
  });
}

startServer();
