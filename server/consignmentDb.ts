// Sprint 04 Patch §4 — Consignment SIM full purchase/sale lifecycle.
// Kept in a separate module so the CentralDatabase class body stays untouched;
// methods are attached to centralDb at import time from server/routes.ts.

import { centralDb } from './db';
import { Consignment, ConsignmentPayment, SimPaymentMethod, SimStatus } from '../src/types';

type AnyDb = any;

const genId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const nowIso = () => new Date().toISOString();

/** Commission resolved per the consignment model (percentage or fixed), never
 *  the owned-inventory margin used by computeSimFinancial (§4). */
function resolveCommission(c: Consignment, soldPrice: number): number {
  return c.commissionType === 'PERCENTAGE'
    ? Math.round((soldPrice * c.commissionValue) / 100)
    : c.commissionValue;
}

function ensureConsignment(db: AnyDb): Consignment[] {
  if (!Array.isArray(db.consignments)) db.consignments = [];
  return db.consignments;
}

function findOne(db: AnyDb, id: string): Consignment {
  const c = ensureConsignment(db).find((x: Consignment) => x.id === id);
  if (!c) throw new Error('سیم‌کارت امانی یافت نشد.');
  return c;
}

/** Keep the SIM row and the consignment row in agreement: consigned stock is
 *  visible in Inventory with an explicit ownership/source marker so it is never
 *  counted as owned inventory in cost basis / internal asset value (§4). */
function syncSimOwnership(db: AnyDb, c: Consignment) {
  const sim = (db.sims || []).find((s: any) => s.id === c.simId);
  if (!sim) return;
  sim.isConsigned = true;
  sim.consignmentId = c.id;
  sim.consignmentStatus = c.status;
  sim.ownershipSource = 'CONSIGNMENT';
  sim.ownerCustomerId = c.ownerCustomerId;
  sim.ownerCustomerName = c.ownerCustomerName;
  if (c.status === 'SOLD') {
    sim.status = SimStatus.SOLD;
    sim.buyerCustomerId = c.buyerCustomerId;
    sim.buyerCustomerName = c.buyerCustomerName;
    sim.saleDate = c.soldAt;
    sim.salePrice = c.soldPrice;
  } else if (c.status === 'RETURNED' || c.status === 'EXPIRED') {
    sim.status = SimStatus.RETURNED;
  } else {
    sim.status = SimStatus.AVAILABLE;
  }
  sim.updatedAt = nowIso();
}

export function getConsignments(status?: string): Consignment[] {
  const db: AnyDb = (centralDb as any).getState();
  const list = ensureConsignment(db);
  return status && status !== 'ALL' ? list.filter((c: Consignment) => c.status === status) : [...list];
}

export function findConsignmentById(id: string): Consignment | undefined {
  const db: AnyDb = (centralDb as any).getState();
  return ensureConsignment(db).find((c: Consignment) => c.id === id);
}

export function createConsignment(input: Partial<Consignment> & { simPhoneNumber: string; operator?: string }): Promise<Consignment> {
  if (!input.simPhoneNumber) throw new Error('شماره سیم‌کارت امانی الزامی است.');
  if (!(Number(input.requestedPrice) > 0)) throw new Error('قیمت پیشنهادی باید بیشتر از صفر باشد.');

  return (centralDb as any).mutate((db: AnyDb) => {
    // Reuse the SIM row when one already exists for this number so inventory
    // stays a single source of truth instead of creating a phantom duplicate.
    let sim = (db.sims || []).find((s: any) => s.phoneNumber === input.simPhoneNumber);
    if (!sim) {
      sim = {
        id: genId('sim'),
        phoneNumber: input.simPhoneNumber,
        operator: input.operator || 'MCI',
        status: SimStatus.AVAILABLE,
        createdAt: nowIso(),
      };
      db.sims.push(sim);
    }
    const c: Consignment = {
      id: genId('cons'),
      simId: sim.id,
      simPhoneNumber: input.simPhoneNumber,
      ownerCustomerId: input.ownerCustomerId || '',
      ownerCustomerName: input.ownerCustomerName || '',
      receivedAt: input.receivedAt || nowIso(),
      requestedPrice: Number(input.requestedPrice),
      commissionType: input.commissionType || 'PERCENTAGE',
      commissionValue: Number(input.commissionValue) || 0,
      agreedTerms: input.agreedTerms || '',
      responsibleUserId: input.responsibleUserId || '',
      responsibleUserName: input.responsibleUserName || '',
      expiryAt: input.expiryAt,
      status: 'CONSIGNMENT',
      settlementStatus: 'PENDING',
      notes: input.notes,
      contactHistory: [],
      documents: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } as Consignment;
    ensureConsignment(db).push(c);
    syncSimOwnership(db, c);
    return c;
  });
}

export function updateConsignment(id: string, patch: Partial<Consignment>): Promise<Consignment> {
  return (centralDb as any).mutate((db: AnyDb) => {
    const c = findOne(db, id);
    const next = { ...c, ...patch, id: c.id, updatedAt: nowIso() };
    Object.assign(c, next);
    syncSimOwnership(db, c);
    return c;
  });
}

export function recordConsignmentSale(id: string, payload: Partial<Consignment>): Promise<Consignment> {
  return (centralDb as any).mutate((db: AnyDb) => {
    const c = findOne(db, id);
    if (c.status !== 'CONSIGNMENT') throw new Error('فروش تنها برای سیم‌کارت امانی در جریان مجاز است.');
    const soldPrice = Number(payload.soldPrice);
    if (!(soldPrice > 0)) throw new Error('مبلغ فروش باید بیشتر از صفر باشد.');

    const commission = resolveCommission(c, soldPrice);
    const ownerPayable = soldPrice - commission;
    c.status = 'SOLD';
    c.soldAt = payload.soldAt || nowIso();
    c.soldPrice = soldPrice;
    c.actualCommission = commission;
    c.ownerPayableAmount = ownerPayable;
    c.buyerCustomerId = payload.buyerCustomerId || c.buyerCustomerId;
    c.buyerCustomerName = payload.buyerCustomerName || c.buyerCustomerName;
    c.updatedAt = nowIso();
    syncSimOwnership(db, c);
    return c;
  });
}

export function addConsignmentPayment(id: string, payload: Partial<ConsignmentPayment>): Promise<{ consignment: Consignment; payment: ConsignmentPayment }> {
  return (centralDb as any).mutate((db: AnyDb) => {
    const c = findOne(db, id);
    const amount = Number(payload.amount);
    if (!(amount > 0)) throw new Error('مبلغ پرداخت باید بیشتر از صفر باشد.');

    const payment: ConsignmentPayment = {
      id: genId('cpay'),
      consignmentId: c.id,
      simId: c.simId,
      amount,
      paymentDate: payload.paymentDate || nowIso(),
      method: (payload.method || SimPaymentMethod.CASH) as SimPaymentMethod,
      referenceNumber: payload.referenceNumber,
      bankName: payload.bankName,
      note: payload.note,
      createdByUserId: payload.createdByUserId,
      createdByUserName: payload.createdByUserName,
      createdAt: nowIso(),
    };
    if (!Array.isArray(db.consignmentPayments)) db.consignmentPayments = [];
    db.consignmentPayments.push(payment);

    // Money received FROM the buyer is tracked on its own fields. It must never
    // drive settlementStatus — the owner is only settled once a payout is
    // actually recorded against consignmentSettlements (§4).
    const received = db.consignmentPayments
      .filter((p: ConsignmentPayment) => p.consignmentId === c.id)
      .reduce((s: number, p: ConsignmentPayment) => s + p.amount, 0);
    c.saleReceivedAmount = received;
    c.salePaymentStatus = c.status !== 'SOLD'
      ? 'PENDING'
      : received >= (c.soldPrice || 0)
        ? 'SETTLED'
        : received > 0
          ? 'PARTIAL'
          : 'PENDING';
    c.updatedAt = nowIso();
    return { consignment: c, payment };
  });
}

export function recordConsignmentReturn(id: string, payload: { returnReason?: string; returnedAt?: string }): Promise<Consignment> {
  return (centralDb as any).mutate((db: AnyDb) => {
    const c = findOne(db, id);
    if (c.status === 'SOLD') throw new Error('سیم‌کارت فروخته‌شده امانی قابل برگشت نیست.');
    c.status = payload.returnedAt ? 'RETURNED' : 'RETURNED';
    c.returnReason = payload.returnReason || '';
    c.returnedAt = payload.returnedAt || nowIso();
    c.updatedAt = nowIso();
    syncSimOwnership(db, c);
    return c;
  });
}

export function settleConsignmentOwner(id: string, payload: Partial<ConsignmentPayment>): Promise<{ consignment: Consignment; payment: ConsignmentPayment }> {
  return (centralDb as any).mutate((db: AnyDb) => {
    const c = findOne(db, id);
    const amount = Number(payload.amount);
    if (!(amount > 0)) throw new Error('مبلغ تسویه باید بیشتر از صفر باشد.');

    const payment: ConsignmentPayment = {
      id: genId('cset'),
      consignmentId: c.id,
      simId: c.simId,
      amount,
      paymentDate: payload.paymentDate || nowIso(),
      method: (payload.method || SimPaymentMethod.CASH) as SimPaymentMethod,
      referenceNumber: payload.referenceNumber,
      bankName: payload.bankName,
      note: payload.note || 'تسویه به مالک',
      createdByUserId: payload.createdByUserId,
      createdByUserName: payload.createdByUserName,
      createdAt: nowIso(),
    };
    if (!Array.isArray(db.consignmentSettlements)) db.consignmentSettlements = [];
    db.consignmentSettlements.push(payment);

    const paid = db.consignmentSettlements
      .filter((p: ConsignmentPayment) => p.consignmentId === c.id)
      .reduce((s: number, p: ConsignmentPayment) => s + p.amount, 0);
    const owed = Math.max(0, (c.ownerPayableAmount || 0) - paid);
    c.settlementStatus = owed === 0 ? 'SETTLED' : 'PARTIAL';
    c.settledAt = owed === 0 ? nowIso() : undefined;
    c.updatedAt = nowIso();
    return { consignment: c, payment };
  });
}

/** Owner-settlement liability, kept separate from owned-inventory cost basis
 *  so potential sale value and payable commitment are reported on their own
 *  (§4 — consignment stock must not distort internal asset value). */
export function getConsignmentExposure() {
  const db: AnyDb = (centralDb as any).getState();
  const consignments = ensureConsignment(db);
  const settlements = db.consignmentSettlements || [];
  return consignments
    .filter((c: Consignment) => c.status === 'SOLD')
    .map((c: Consignment) => {
      const paid = settlements
        .filter((p: ConsignmentPayment) => p.consignmentId === c.id)
        .reduce((s: number, p: ConsignmentPayment) => s + p.amount, 0);
      return {
        id: c.id,
        simPhoneNumber: c.simPhoneNumber,
        ownerCustomerName: c.ownerCustomerName,
        soldPrice: c.soldPrice || 0,
        commission: c.actualCommission || 0,
        ownerPayable: c.ownerPayableAmount || 0,
        ownerPaid: paid,
        ownerOutstanding: Math.max(0, (c.ownerPayableAmount || 0) - paid),
        settlementStatus: c.settlementStatus,
      };
    });
}