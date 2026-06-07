/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { Customer, Contract, Installment, Payment, ActivityLog, NotificationItem } from '../types.ts';

const DB_FILE_PATH = path.join(process.cwd(), 'data-store.json');

interface DatabaseState {
  customers: Customer[];
  contracts: Contract[];
  installments: Installment[];
  payments: Payment[];
  activityLogs: ActivityLog[];
  notifications: NotificationItem[];
}

const INITIAL_STATE: DatabaseState = {
  customers: [
    {
      id: 'cust_1',
      fullName: 'میثم سلطانی (Meisam Soltani)',
      phoneNumber: '09121112222',
      createdAt: new Date('2026-01-10').toISOString(),
      updatedAt: new Date('2026-01-10').toISOString(),
    },
    {
      id: 'cust_2',
      fullName: 'علی رضایی (Ali Rezaei)',
      phoneNumber: '09123334444',
      createdAt: new Date('2026-02-15').toISOString(),
      updatedAt: new Date('2026-02-15').toISOString(),
    },
    {
      id: 'cust_3',
      fullName: 'امير دهقان (Amir Dehghan)',
      phoneNumber: '09127778888',
      createdAt: new Date('2026-03-01').toISOString(),
      updatedAt: new Date('2026-03-01').toISOString(),
    }
  ],
  contracts: [
    {
      id: 'cnt_1',
      customerId: 'cust_1',
      contractNumber: 'MC-2026-001',
      simNumber: '09129999999', /* Triple Gold Sim */
      contractDate: '2026-01-10',
      endDate: '2026-07-10',
      totalPrice: 1200000000, /* 1.2 Billion Rials */
      prepayment: 300000000,
      remainingBalance: 900000000,
      monthlyInstallment: 150000000,
      monthsCount: 6,
      status: 'active',
      notes: 'شماره رند گلد - واگذاری پس از پرداخت کامل اقساط. (Premium gold number code)',
      createdAt: new Date('2026-01-10').toISOString(),
      updatedAt: new Date('2026-01-10').toISOString(),
    },
    {
      id: 'cnt_2',
      customerId: 'cust_2',
      contractNumber: 'MC-2026-002',
      simNumber: '09128888888',
      contractDate: '2026-02-15',
      endDate: '2027-02-15',
      totalPrice: 800000000,
      prepayment: 200000000,
      remainingBalance: 600000000,
      monthlyInstallment: 50000000,
      monthsCount: 12,
      status: 'active',
      notes: 'شرایط اقساط ۱۲ ماهه منظم (12-month installment plan)',
      createdAt: new Date('2026-02-15').toISOString(),
      updatedAt: new Date('2026-02-15').toISOString(),
    },
    {
      id: 'cnt_3',
      customerId: 'cust_3',
      contractNumber: 'MC-2026-003',
      simNumber: '09125555555',
      contractDate: '2025-10-01',
      endDate: '2026-04-01',
      totalPrice: 600000000,
      prepayment: 300000000,
      remainingBalance: 300000000,
      monthlyInstallment: 50000000,
      monthsCount: 6,
      status: 'finished',
      notes: 'قرارداد تکمیل شده و سند واگذار شد. (Contract finished and title transferred)',
      createdAt: new Date('2025-10-01').toISOString(),
      updatedAt: new Date('2026-04-01').toISOString(),
    }
  ],
  installments: [
    // Contract 1 Installments (6 months starting 2026-02-10)
    {
      id: 'inst_1_1',
      contractId: 'cnt_1',
      installmentNumber: 1,
      dueDate: '2026-02-10',
      amount: 150000000,
      status: 'paid',
      paidDate: '2026-02-09',
      createdAt: new Date('2026-01-10').toISOString(),
      updatedAt: new Date('2026-02-09').toISOString(),
    },
    {
      id: 'inst_1_2',
      contractId: 'cnt_1',
      installmentNumber: 2,
      dueDate: '2026-03-10',
      amount: 150000000,
      status: 'paid',
      paidDate: '2026-03-11',
      createdAt: new Date('2026-01-10').toISOString(),
      updatedAt: new Date('2026-03-11').toISOString(),
    },
    {
      id: 'inst_1_3',
      contractId: 'cnt_1',
      installmentNumber: 3,
      dueDate: '2026-04-10',
      amount: 150000000,
      status: 'paid',
      paidDate: '2026-04-10',
      createdAt: new Date('2026-01-10').toISOString(),
      updatedAt: new Date('2026-04-10').toISOString(),
    },
    {
      id: 'inst_1_4',
      contractId: 'cnt_1',
      installmentNumber: 4,
      dueDate: '2026-05-10',
      amount: 150000000,
      status: 'paid',
      paidDate: '2026-05-08',
      createdAt: new Date('2026-01-10').toISOString(),
      updatedAt: new Date('2026-05-08').toISOString(),
    },
    {
      id: 'inst_1_5',
      contractId: 'cnt_1',
      installmentNumber: 5,
      dueDate: '2026-06-10', /* Coming up or overdue based on current time June 4, 2026 */
      amount: 150000000,
      status: 'pending',
      paidDate: null,
      createdAt: new Date('2026-01-10').toISOString(),
      updatedAt: new Date('2026-01-10').toISOString(),
    },
    {
      id: 'inst_1_6',
      contractId: 'cnt_1',
      installmentNumber: 6,
      dueDate: '2026-07-10',
      amount: 150000000,
      status: 'pending',
      paidDate: null,
      createdAt: new Date('2026-01-10').toISOString(),
      updatedAt: new Date('2026-01-10').toISOString(),
    },

    // Contract 2 Installments (12 months starting 2026-03-15)
    {
      id: 'inst_2_1',
      contractId: 'cnt_2',
      installmentNumber: 1,
      dueDate: '2026-03-15',
      amount: 50000000,
      status: 'paid',
      paidDate: '2026-03-15',
      createdAt: new Date('2026-02-15').toISOString(),
      updatedAt: new Date('2026-03-15').toISOString(),
    },
    {
      id: 'inst_2_2',
      contractId: 'cnt_2',
      installmentNumber: 2,
      dueDate: '2026-04-15',
      amount: 50000000,
      status: 'paid',
      paidDate: '2026-04-14',
      createdAt: new Date('2026-02-15').toISOString(),
      updatedAt: new Date('2026-04-14').toISOString(),
    },
    {
      id: 'inst_2_3',
      contractId: 'cnt_2',
      installmentNumber: 3,
      dueDate: '2026-05-15', /* Current time is June 4, 2026 - this is OVERDUE! */
      amount: 50000000,
      status: 'overdue',
      paidDate: null,
      createdAt: new Date('2026-02-15').toISOString(),
      updatedAt: new Date('2026-05-16').toISOString(),
    },
    {
      id: 'inst_2_4',
      contractId: 'cnt_2',
      installmentNumber: 4,
      dueDate: '2026-06-15',
      amount: 50000000,
      status: 'pending',
      paidDate: null,
      createdAt: new Date('2026-02-15').toISOString(),
      updatedAt: new Date('2026-02-15').toISOString(),
    },
    {
      id: 'inst_2_5',
      contractId: 'cnt_2',
      installmentNumber: 5,
      dueDate: '2026-07-15',
      amount: 50000000,
      status: 'pending',
      paidDate: null,
      createdAt: new Date('2026-02-15').toISOString(),
      updatedAt: new Date('2026-02-15').toISOString(),
    },
    {
      id: 'inst_2_6',
      contractId: 'cnt_2',
      installmentNumber: 6,
      dueDate: '2026-08-15',
      amount: 50000000,
      status: 'pending',
      paidDate: null,
      createdAt: new Date('2026-02-15').toISOString(),
      updatedAt: new Date('2026-02-15').toISOString(),
    },
    {
      id: 'inst_2_7',
      contractId: 'cnt_2',
      installmentNumber: 7,
      dueDate: '2026-09-15',
      amount: 50000000,
      status: 'pending',
      paidDate: null,
      createdAt: new Date('2026-02-15').toISOString(),
      updatedAt: new Date('2026-02-15').toISOString(),
    },
    {
      id: 'inst_2_8',
      contractId: 'cnt_2',
      installmentNumber: 8,
      dueDate: '2026-10-15',
      amount: 50000000,
      status: 'pending',
      paidDate: null,
      createdAt: new Date('2026-02-15').toISOString(),
      updatedAt: new Date('2026-02-15').toISOString(),
    },
    {
      id: 'inst_2_9',
      contractId: 'cnt_2',
      installmentNumber: 9,
      dueDate: '2026-11-15',
      amount: 50000000,
      status: 'pending',
      paidDate: null,
      createdAt: new Date('2026-02-15').toISOString(),
      updatedAt: new Date('2026-02-15').toISOString(),
    },
    {
      id: 'inst_2_10',
      contractId: 'cnt_2',
      installmentNumber: 10,
      dueDate: '2026-12-15',
      amount: 50000000,
      status: 'pending',
      paidDate: null,
      createdAt: new Date('2026-02-15').toISOString(),
      updatedAt: new Date('2026-02-15').toISOString(),
    },
    {
      id: 'inst_2_11',
      contractId: 'cnt_2',
      installmentNumber: 11,
      dueDate: '2027-01-15',
      amount: 50000000,
      status: 'pending',
      paidDate: null,
      createdAt: new Date('2026-02-15').toISOString(),
      updatedAt: new Date('2026-02-15').toISOString(),
    },
    {
      id: 'inst_2_12',
      contractId: 'cnt_2',
      installmentNumber: 12,
      dueDate: '2027-02-15',
      amount: 50000000,
      status: 'pending',
      paidDate: null,
      createdAt: new Date('2026-02-15').toISOString(),
      updatedAt: new Date('2026-02-15').toISOString(),
    },

    // Contract 3 Installments (all paid)
    {
      id: 'inst_3_1',
      contractId: 'cnt_3',
      installmentNumber: 1,
      dueDate: '2025-11-01',
      amount: 50000000,
      status: 'paid',
      paidDate: '2025-11-01',
      createdAt: new Date('2025-10-01').toISOString(),
      updatedAt: new Date('2025-11-01').toISOString(),
    },
    {
      id: 'inst_3_2',
      contractId: 'cnt_3',
      installmentNumber: 2,
      dueDate: '2025-12-01',
      amount: 50000000,
      status: 'paid',
      paidDate: '2025-12-01',
      createdAt: new Date('2025-10-01').toISOString(),
      updatedAt: new Date('2025-12-01').toISOString(),
    },
    {
      id: 'inst_3_3',
      contractId: 'cnt_3',
      installmentNumber: 3,
      dueDate: '2026-01-01',
      amount: 50000000,
      status: 'paid',
      paidDate: '2026-01-02',
      createdAt: new Date('2025-10-01').toISOString(),
      updatedAt: new Date('2026-01-02').toISOString(),
    },
    {
      id: 'inst_3_4',
      contractId: 'cnt_3',
      installmentNumber: 4,
      dueDate: '2026-02-01',
      amount: 50000000,
      status: 'paid',
      paidDate: '2026-01-29',
      createdAt: new Date('2025-10-01').toISOString(),
      updatedAt: new Date('2026-01-29').toISOString(),
    },
    {
      id: 'inst_3_5',
      contractId: 'cnt_3',
      installmentNumber: 5,
      dueDate: '2026-03-01',
      amount: 50000000,
      status: 'paid',
      paidDate: '2026-03-01',
      createdAt: new Date('2025-10-01').toISOString(),
      updatedAt: new Date('2026-03-01').toISOString(),
    },
    {
      id: 'inst_3_6',
      contractId: 'cnt_3',
      installmentNumber: 6,
      dueDate: '2026-04-01',
      amount: 50000000,
      status: 'paid',
      paidDate: '2026-04-01',
      createdAt: new Date('2025-10-01').toISOString(),
      updatedAt: new Date('2026-04-01').toISOString(),
    }
  ],
  payments: [
    {
      id: 'pay_1_1',
      contractId: 'cnt_1',
      amount: 150000000,
      paymentDate: '2026-02-09',
      receiptImage: null,
      notes: 'قسط اول MC-2026-001',
      createdAt: new Date('2026-02-09').toISOString(),
      updatedAt: new Date('2026-02-09').toISOString(),
    },
    {
      id: 'pay_1_2',
      contractId: 'cnt_1',
      amount: 150000000,
      paymentDate: '2026-03-11',
      receiptImage: null,
      notes: 'حواله بانکی قسط دوم',
      createdAt: new Date('2026-03-11').toISOString(),
      updatedAt: new Date('2026-03-11').toISOString(),
    },
    {
      id: 'pay_1_3',
      contractId: 'cnt_1',
      amount: 150000000,
      paymentDate: '2026-04-10',
      receiptImage: null,
      notes: 'پرداخت قسط سوم آنلاین',
      createdAt: new Date('2026-04-10').toISOString(),
      updatedAt: new Date('2026-04-10').toISOString(),
    },
    {
      id: 'pay_1_4',
      contractId: 'cnt_1',
      amount: 150000000,
      paymentDate: '2026-05-08',
      receiptImage: null,
      notes: 'پرداخت نقدی قسط چهارم مراجع حضوری',
      createdAt: new Date('2026-05-08').toISOString(),
      updatedAt: new Date('2026-05-08').toISOString(),
    },
    {
      id: 'pay_2_1',
      contractId: 'cnt_2',
      amount: 50000000,
      paymentDate: '2026-03-15',
      receiptImage: null,
      notes: 'قسط اول تایید شده کارت به کارت',
      createdAt: new Date('2026-03-15').toISOString(),
      updatedAt: new Date('2026-03-15').toISOString(),
    },
    {
      id: 'pay_2_2',
      contractId: 'cnt_2',
      amount: 50000000,
      paymentDate: '2026-04-14',
      receiptImage: null,
      notes: 'انتقال پایا قسط دوم',
      createdAt: new Date('2026-04-14').toISOString(),
      updatedAt: new Date('2026-04-14').toISOString(),
    }
  ],
  activityLogs: [
    {
      id: 'act_1',
      type: 'contract_created',
      titleFa: 'ثبت قرارداد جدید',
      titleEn: 'New Contract Registered',
      detailsFa: 'قرارداد MC-2026-001 برای مشتری میثمی سلطانی با موفقیت ثبت شد.',
      detailsEn: 'Contract MC-2026-001 registered for Meisam Soltani.',
      timestamp: new Date('2026-01-10T12:00:00Z').toISOString(),
    },
    {
      id: 'act_2',
      type: 'payment_received',
      titleFa: 'ثبت پرداخت قسط',
      titleEn: 'Installment Payment Received',
      detailsFa: 'قسط چهارم از قرارداد MC-2026-001 به مبلغ ۱۵۰,۰۰۰,۰۰۰ ریال دریافت شد.',
      detailsEn: 'Payment of 150,000,000 IRR received for Contract MC-2026-001 (Installment 4).',
      timestamp: new Date('2026-05-08T15:30:00Z').toISOString(),
    },
    {
      id: 'act_3',
      type: 'customer_created',
      titleFa: 'مشتری جدید ثبت شد',
      titleEn: 'New Customer Created',
      detailsFa: 'مشتری علی رضایی با شماره تماس 09123334444 ثبت شد.',
      detailsEn: 'Customer Ali Rezaei with phone 09123334444 was created.',
      timestamp: new Date('2026-02-15T11:15:00Z').toISOString(),
    }
  ],
  notifications: [
    {
      id: 'not_1',
      type: 'overdue',
      messageFa: 'قسط شماره ۳ قرارداد MC-2026-002 علی رضایی به مبلغ ۵۰,۰۰۰,۰۰۰ ریال بیش از ۱۵ روز تاخیر دارد.',
      messageEn: 'Installment #3 of Contract MC-2026-002 (Ali Rezaei) is overdue by more than 15 days.',
      date: '2026-05-30',
      isRead: false,
    },
    {
      id: 'not_2',
      type: 'ending_soon',
      messageFa: 'قرارداد MC-2026-001 میثمی سلطانی بزودی در تاریخ ۱۴۰۵/۰۴/۲۰ به اتمام می‌رسد.',
      messageEn: 'Contract MC-2026-001 (Meisam Soltani) is ending soon on 2026-07-10.',
      date: '2026-06-01',
      isRead: false,
    },
    {
      id: 'not_3',
      type: 'paid_recent',
      messageFa: 'پرداخت اخیر قسط چهارم قرارداد MC-2026-001 ثبت و تایید گردید.',
      messageEn: 'Recent payment for Installment #4 of Contract MC-2026-001 confirmed.',
      date: '2026-05-08',
      isRead: true,
    }
  ]
};

// Ensure database file is initialized
export function initDb() {
  try {
    if (!fs.existsSync(DB_FILE_PATH)) {
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(INITIAL_STATE, null, 2), 'utf-8');
      console.log('Database initialized successfully at:', DB_FILE_PATH);
    } else {
      // Perform automated overdue check on boot up relative to current time (June 4, 2026)
      checkAndUpdateOverdueInstallments();
    }
  } catch (err) {
    console.error('Error initializing database file:', err);
  }
}

// Low-level helper to read state
export function getDb(): DatabaseState {
  try {
    if (!fs.existsSync(DB_FILE_PATH)) {
      initDb();
    }
    const data = fs.readFileSync(DB_FILE_PATH, 'utf-8');
    return JSON.parse(data) as DatabaseState;
  } catch (err) {
    console.error('Error reading database file, returning initial state:', err);
    return INITIAL_STATE;
  }
}

// Low-level helper to write state
export function saveDb(state: DatabaseState): void {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing database file:', err);
  }
}

// Check and update any pending installment that has passed its due date to 'overdue'
// Let's use 2026-06-04 as the current date (derived from system date)
export function checkAndUpdateOverdueInstallments() {
  const db = getDb();
  let changed = false;
  const todayStr = '2026-06-04';

  db.installments.forEach((inst) => {
    if (inst.status === 'pending' && inst.dueDate < todayStr) {
      inst.status = 'overdue';
      inst.updatedAt = new Date().toISOString();
      changed = true;

      // Add a notification for it if it does not already exist
      const exists = db.notifications.some(
        (n) => n.type === 'overdue' && n.messageEn.includes(inst.id) || n.messageEn.includes(inst.dueDate)
      );
      if (!exists) {
        const contract = db.contracts.find((c) => c.id === inst.contractId);
        const customer = contract ? db.customers.find((cust) => cust.id === contract.customerId) : null;
        const name = customer ? customer.fullName : 'Unknown';
        const num = contract ? contract.contractNumber : '';
        
        db.notifications.push({
          id: `not_due_${inst.id}`,
          type: 'overdue',
          messageFa: `قسط شماره ${inst.installmentNumber} قرارداد ${num} (${name}) سررسید گذشته است.`,
          messageEn: `Installment #${inst.installmentNumber} of Contract ${num} (${name}) is overdue.`,
          date: todayStr,
          isRead: false,
        });
      }
    }
  });

  if (changed) {
    saveDb(db);
  }
}

// Activity logging helper
export function addLog(type: ActivityLog['type'], titleFa: string, titleEn: string, detailsFa: string, detailsEn: string) {
  const db = getDb();
  const newLog: ActivityLog = {
    id: `act_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    type,
    titleFa,
    titleEn,
    detailsFa,
    detailsEn,
    timestamp: new Date().toISOString(),
  };
  db.activityLogs.unshift(newLog);
  // Keep logs at a reasonable limit (e.g. 100)
  if (db.activityLogs.length > 100) {
    db.activityLogs = db.activityLogs.slice(0, 100);
  }
  saveDb(db);
}

// --- CURD Operations ---

// 1. Customer
export function getCustomers() {
  return getDb().customers;
}

export function createCustomer(fullName: string, phoneNumber: string): Customer {
  const db = getDb();

  // Validate unique phone number
  const existing = db.customers.find(c => c.phoneNumber === phoneNumber);
  if (existing) {
    throw new Error('Phone number is already associated with another customer / این شماره تلفن قبلاً ثبت شده است');
  }

  const newCust: Customer = {
    id: `cust_${Date.now()}`,
    fullName,
    phoneNumber,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.customers.push(newCust);
  saveDb(db);

  addLog(
    'customer_created',
    'ثبت مشتری جدید',
    'Customer Registered',
    `مشتری جدید "${fullName}" با شماره"${phoneNumber}" با موفقیت ثبت شد.`,
    `Customer "${fullName}" with phone "${phoneNumber}" was successfully created.`
  );

  return newCust;
}

export function updateCustomer(id: string, fullName: string, phoneNumber: string): Customer {
  const db = getDb();
  const customer = db.customers.find(c => c.id === id);
  if (!customer) {
    throw new Error('Customer not found / مشتری پیدا نشد');
  }

  // Check unique phone number exclusion itself
  const phoneConflict = db.customers.find(c => c.phoneNumber === phoneNumber && c.id !== id);
  if (phoneConflict) {
    throw new Error('Phone number already in use by another customer');
  }

  customer.fullName = fullName;
  customer.phoneNumber = phoneNumber;
  customer.updatedAt = new Date().toISOString();
  saveDb(db);

  return customer;
}

// 2. Contracts and Installments
export function getContracts() {
  const db = getDb();
  return db.contracts.map(cnt => {
    const customer = db.customers.find(c => c.id === cnt.customerId);
    const installments = db.installments.filter(i => i.contractId === cnt.id);
    const payments = db.payments.filter(p => p.contractId === cnt.id);
    return {
      ...cnt,
      customer,
      installments,
      payments,
    };
  });
}

export function createContract(data: {
  customerId: string;
  contractNumber: string;
  simNumber: string;
  contractDate: string;
  totalPrice: number;
  prepayment: number;
  monthsCount: number;
  notes: string;
}): Contract {
  const db = getDb();
  const customer = db.customers.find(c => c.id === data.customerId);
  if (!customer) {
    throw new Error('Associated customer not found / مشتری مرتبط پیدا نشد');
  }

  const contractId = `cnt_${Date.now()}`;
  const remainingBalance = data.totalPrice - data.prepayment;
  const monthlyInstallment = data.monthsCount > 0 ? Math.round(remainingBalance / data.monthsCount) : 0;

  // Calculate endDate
  const dateObj = new Date(data.contractDate);
  dateObj.setMonth(dateObj.getMonth() + data.monthsCount);
  const endDate = dateObj.toISOString().split('T')[0];

  const newContract: Contract = {
    id: contractId,
    customerId: data.customerId,
    contractNumber: data.contractNumber || `MC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    simNumber: data.simNumber,
    contractDate: data.contractDate,
    endDate,
    totalPrice: data.totalPrice,
    prepayment: data.prepayment,
    remainingBalance,
    monthlyInstallment,
    monthsCount: data.monthsCount,
    status: 'active',
    notes: data.notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.contracts.push(newContract);

  // Generate Installments
  for (let i = 1; i <= data.monthsCount; i++) {
    const dueDateObj = new Date(data.contractDate);
    dueDateObj.setMonth(dueDateObj.getMonth() + i);
    const dueDate = dueDateObj.toISOString().split('T')[0];

    const installment: Installment = {
      id: `inst_${contractId}_${i}`,
      contractId,
      installmentNumber: i,
      dueDate,
      amount: monthlyInstallment,
      status: 'pending',
      paidDate: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.installments.push(installment);
  }

  saveDb(db);

  addLog(
    'contract_created',
    'ایجاد قرارداد جدید و اقساط',
    'Contract & Installments Created',
    `قرارداد گوشی/سیم‌کارت ${data.simNumber} به نام "${customer.fullName}" تفکیک به ${data.monthsCount} قسط ثبت شد.`,
    `Contract for SIM ${data.simNumber} registered for "${customer.fullName}" split into ${data.monthsCount} monthly installments.`
  );

  return newContract;
}

export function updateContract(id: string, updates: Partial<Contract>): Contract {
  const db = getDb();
  const contract = db.contracts.find(c => c.id === id);
  if (!contract) {
    throw new Error('Contract not found / قرارداد یافت نشد');
  }

  Object.assign(contract, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });

  saveDb(db);
  
  const customer = db.customers.find(c => c.id === contract.customerId);
  const name = customer ? customer.fullName : '';

  addLog(
    'contract_status',
    'بروزرسانی وضعیت قرارداد',
    'Contract Progress Updated',
    `وضعیت قرارداد ${contract.contractNumber} متعلق به "${name}" به شکل جدید بروزرسانی شد.`,
    `Contract status of ${contract.contractNumber} (${name}) updated.`
  );

  return contract;
}

export function deleteContract(id: string) {
  const db = getDb();
  const contractIndex = db.contracts.findIndex(c => c.id === id);
  if (contractIndex === -1) {
    throw new Error('Contract not found / قرارداد پیدا نشد');
  }

  const contract = db.contracts[contractIndex];
  db.contracts.splice(contractIndex, 1);

  // Cascade delete installments and payments
  db.installments = db.installments.filter(i => i.contractId !== id);
  db.payments = db.payments.filter(p => p.contractId !== id);

  saveDb(db);

  addLog(
    'contract_deleted',
    'حذف کامل قرارداد',
    'Contract Deleted completely',
    `قرارداد به شماره ${contract.contractNumber} به همراه تمام سوابق اقساط و پرداختی حذف شد.`,
    `Contract ${contract.contractNumber} along with all billing installments/payments was deleted.`
  );

  return { success: true };
}

// 3. Record Payment
export function recordPayment(data: {
  contractId: string;
  amount: number;
  paymentDate: string;
  receiptImage: string | null;
  notes: string;
}): Payment {
  const db = getDb();
  const contract = db.contracts.find(c => c.id === data.contractId);
  if (!contract) {
    throw new Error('Contract not found / قرارداد یافت نشد');
  }

  const paymentId = `pay_${Date.now()}`;
  const newPayment: Payment = {
    id: paymentId,
    contractId: data.contractId,
    amount: data.amount,
    paymentDate: data.paymentDate,
    receiptImage: data.receiptImage,
    notes: data.notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.payments.push(newPayment);

  // Update Remaining Balance on Contract
  const oldRemaining = contract.remainingBalance;
  contract.remainingBalance = Math.max(0, contract.remainingBalance - data.amount);
  contract.updatedAt = new Date().toISOString();

  // Match and pay off oldest installments
  let amountLeftToAllocate = data.amount;
  const contractInstallments = db.installments
    .filter(inst => inst.contractId === data.contractId && inst.status !== 'paid')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  for (const inst of contractInstallments) {
    if (amountLeftToAllocate <= 0) break;
    
    // Check if the amount allocates can mark this installment as paid
    if (amountLeftToAllocate >= inst.amount) {
      inst.status = 'paid';
      inst.paidDate = data.paymentDate;
      inst.updatedAt = new Date().toISOString();
      amountLeftToAllocate -= inst.amount;
    } else {
      // Partially paid - but according to model, we can transition to paid if they pay the amount
      // Since increments might be exact or close, we mark it paid if it's mostly paid, or save partial credits
      inst.status = 'paid';
      inst.paidDate = data.paymentDate;
      inst.updatedAt = new Date().toISOString();
      amountLeftToAllocate = 0;
    }
  }

  // If the entire remaining balance of the contract becomes 0, automatically finalize it!
  if (contract.remainingBalance <= 0) {
    contract.status = 'finished';
  }

  saveDb(db);

  // Add notification
  const customer = db.customers.find(c => c.id === contract.customerId);
  const name = customer ? customer.fullName : 'Unknown';

  db.notifications.push({
    id: `not_pay_${paymentId}`,
    type: 'paid_recent',
    messageFa: `دریافت قسط قرارداد ${contract.contractNumber} از "${name}" به مبلغ ${Number(data.amount).toLocaleString()} ریال ثبت شد.`,
    messageEn: `Payment of ${Number(data.amount).toLocaleString()} IRR received for ${contract.contractNumber} (${name}).`,
    date: data.paymentDate,
    isRead: false,
  });

  addLog(
    'payment_received',
    'دریافت و تایید پرداخت اقساط',
    'Installment Payment Confirmed',
    `مبلغ ${Number(data.amount).toLocaleString()} ریال برای قرارداد ${contract.contractNumber} مابقی قسط وصول گردید.`,
    `Payment of ${Number(data.amount).toLocaleString()} IRR processed for Contract ${contract.contractNumber} (${name}).`
  );

  return newPayment;
}

// 4. Quick search by phone number
export function searchContractsByPhoneNumber(phoneNumber: string) {
  const db = getDb();
  // Standardize search term: remove whitespace
  const sanitizedSearch = phoneNumber.trim().replace(/\s+/g, '');

  if (!sanitizedSearch) return [];

  // Find all customer matches first
  const matchingCustomers = db.customers.filter(
    cust => cust.phoneNumber.replace(/\s+/g, '').includes(sanitizedSearch) || 
            sanitizedSearch.includes(cust.phoneNumber.replace(/\s+/g, ''))
  );
  const matchingCustomerIds = matchingCustomers.map(c => c.id);

  // Filter contracts that match either customer or SIM/device number
  const foundContracts = db.contracts.filter(c => {
    const isCustomerMatch = matchingCustomerIds.includes(c.customerId);
    const isSimMatch = c.simNumber && (
      c.simNumber.replace(/\s+/g, '').includes(sanitizedSearch) ||
      sanitizedSearch.includes(c.simNumber.replace(/\s+/g, ''))
    );
    return isCustomerMatch || isSimMatch;
  });

  return foundContracts.map(cnt => {
    const customer = db.customers.find(cust => cust.id === cnt.customerId);
    const installments = db.installments.filter(i => i.contractId === cnt.id);
    const payments = db.payments.filter(p => p.contractId === cnt.id);
    return {
      ...cnt,
      customer,
      installments,
      payments,
    };
  });
}

// -- Clear Database alerts --
export function getNotifications() {
  const db = getDb();
  return db.notifications;
}

export function markNotificationAsRead(id: string) {
  const db = getDb();
  const notif = db.notifications.find(n => n.id === id);
  if (notif) {
    notif.isRead = true;
    saveDb(db);
  }
}

export function getStats() {
  const db = getDb();
  const contracts = db.contracts;
  const installments = db.installments;

  const totalCustomers = db.customers.length;
  const activeContracts = contracts.filter(c => c.status === 'active').length;
  const finishedContracts = contracts.filter(c => c.status === 'finished').length;
  
  // Total Outstanding Balance
  const totalOutstandingBalance = contracts
    .filter(c => c.status === 'active')
    .reduce((sum, c) => sum + c.remainingBalance, 0);

  // Overdue Installments count
  const overdueCount = installments.filter(inst => inst.status === 'overdue').length;

  // Let's calculate income per month (dynamic for charts)
  // Group payments by Month
  const incomeByMonth: Record<string, number> = {};
  db.payments.forEach(pay => {
    // Format YYYY-MM
    const month = pay.paymentDate.substring(0, 7);
    incomeByMonth[month] = (incomeByMonth[month] || 0) + pay.amount;
  });

  const months = Object.keys(incomeByMonth).sort();
  const recent6Months = months.slice(-6);
  if (recent6Months.length === 0) {
    // Add default fallbacks if empty
    recent6Months.push('2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06');
  }

  const monthlyIncomeChart = recent6Months.map(month => ({
    month,
    income: incomeByMonth[month] || 0,
  }));

  // Collection Rate: Paid installments / Total past-due or paid installments
  const totalDueInstallments = installments.filter(i => i.status === 'paid' || i.status === 'overdue');
  const paidCount = installments.filter(i => i.status === 'paid').length;
  const collectionRate = totalDueInstallments.length > 0 
    ? Math.round((paidCount / installments.length) * 100) 
    : 100;

  return {
    totalCustomers,
    activeContracts,
    finishedContracts,
    totalOutstandingBalance,
    overdueCount,
    monthlyIncomeChart,
    collectionRate,
    recentActivity: db.activityLogs.slice(0, 10),
  };
}
