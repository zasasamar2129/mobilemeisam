import {
  SimCard,
  SimPurchase,
  SimPurchasePayment,
  SimPurchaseReturn,
  SimSalePayment,
  SimSaleReturn,
  SimCostItem,
  SimFinancialSummary,
  SimTimelineItem,
  SimTimelineEventType,
  SimPurchaseStatus,
} from '../types';

// ---------------------------------------------------------------------
// Pure SIM financial math. NO DOM / NO async / no DB access.
// Used by BOTH the client (storage.ts) and the server (db.ts), so any
// change here is automatically in sync both sides.
// ---------------------------------------------------------------------

const sum = (nums: number[]): number => nums.reduce((a, b) => a + (Number(b) || 0), 0);

export function derivePurchaseStatus(opts: {
  purchasePrice: number;
  paid: number;
  returnAdjust: number;
  reversed?: boolean;
}): SimPurchaseStatus {
  if (opts.reversed) return SimPurchaseStatus.REVERSED;
  if (opts.returnAdjust >= opts.purchasePrice && opts.purchasePrice > 0) return SimPurchaseStatus.RETURNED;
  if (opts.paid >= opts.purchasePrice) return SimPurchaseStatus.PAID;
  if (opts.paid > 0) return SimPurchaseStatus.PARTIALLY_PAID;
  return SimPurchaseStatus.UNPAID;
}

export function getCurrentPurchase(purchases: SimPurchase[], simId: string): SimPurchase | null {
  const mine = purchases.filter((p) => p && p.simId === simId);
  if (mine.length === 0) return null;
  // Latest wins; ties resolved deterministically by id.
  return mine.reduce((a, b) =>
    (a.createdAt || '') >= (b.createdAt || '') ? (a.createdAt === b.createdAt && a.id < b.id ? a : b) : b
  );
}

export function computePurchaseBalance(purchase: SimPurchase | null, payments: SimPurchasePayment[], returns: SimPurchaseReturn[], simId: string): number {
  if (!purchase) return 0;
  const paid = sum(payments.filter((p) => p.purchaseId === purchase.id).map((p) => p.amount));
  const refunded = sum(returns.filter((r) => r.purchaseId === purchase.id).map((r) => r.refundedToMMBA));
  return purchase.purchasePrice - paid + refunded;
}

export function computePurchaseRemainingReturnable(purchase: SimPurchase | null, returns: SimPurchaseReturn[], simId: string): number {
  if (!purchase) return 0;
  const alreadyReturned = sum(returns.filter((r) => r.purchaseId === purchase.id).map((r) => r.returnAmount));
  return Math.max(0, purchase.purchasePrice - alreadyReturned);
}

export function computeSimFinancial(
  sim: SimCard,
  purchases: SimPurchase[],
  payments: SimPurchasePayment[],
  returns: SimPurchaseReturn[],
  salePayments: SimSalePayment[],
  saleReturns: SimSaleReturn[],
  costItems: SimCostItem[]
): SimFinancialSummary {
  const purchase = getCurrentPurchase(purchases, sim.id);
  const purchaseCost = purchase ? Number(purchase.purchasePrice) || 0 : null;

  const purchaseRelatedCosts = sum(costItems.filter((c) => c.simId === sim.id && c.side === 'PURCHASE').map((c) => c.amount));
  const saleRelatedCosts = sum(costItems.filter((c) => c.simId === sim.id && c.side === 'SALE').map((c) => c.amount));

  const purchaseReturnAdjustments = sum(returns.filter((r) => r.simId === sim.id).map((r) => r.returnAmount));
  const saleReturnAdjustments = sum(saleReturns.filter((r) => r.simId === sim.id).map((r) => r.returnAmount));

  const netCost = purchaseCost === null ? null : purchaseCost + purchaseRelatedCosts - purchaseReturnAdjustments;

  const saleRevenue = Number(sim.salePrice) || 0;
  const netRevenue = saleRevenue - saleReturnAdjustments;
  const grossMargin = netCost === null ? null : netRevenue - netCost;

  const paid = sum(payments.filter((p) => purchase && p.purchaseId === purchase.id).map((p) => p.amount));
  const purchaseBalance = purchaseCost === null ? 0 : purchaseCost - paid + sum(returns.filter((r) => purchase && r.purchaseId === purchase.id).map((r) => r.refundedToMMBA));

  const saleReceived = sum(salePayments.filter((p) => p.simId === sim.id).map((p) => p.amount));
  const saleReceivable = Math.max(0, saleRevenue - saleReceived - saleReturnAdjustments);

  const historicalMissingPurchaseCost = purchaseCost === null && (Number(sim.purchasePrice) || 0) > 0;
  const status = purchaseCost === null ? SimPurchaseStatus.UNPAID : derivePurchaseStatus({ purchasePrice: purchaseCost, paid, returnAdjust: purchaseReturnAdjustments });

  return {
    purchaseCost,
    purchaseRelatedCosts,
    purchaseReturnAdjustments,
    netCost,
    saleRevenue,
    saleRelatedCosts,
    saleReturnAdjustments,
    netRevenue,
    grossMargin,
    purchasePaid: paid,
    purchaseBalance,
    saleReceived,
    saleReceivable,
    historicalMissingPurchaseCost,
    status,
  };
}

export function deriveTimelineItems(
  sim: SimCard,
  purchases: SimPurchase[],
  payments: SimPurchasePayment[],
  returns: SimPurchaseReturn[],
  salePayments: SimSalePayment[],
  saleReturns: SimSaleReturn[],
  costItems: SimCostItem[]
): SimTimelineItem[] {
  const items: SimTimelineItem[] = [];

  const sellerFor = (purchaseId: string) => {
    const p = purchases.find((x) => x.id === purchaseId);
    return p && p.sellerPartyName ? p.sellerPartyName : '';
  };

  const buyer = sim.buyerCustomerName || '';

  for (const p of purchases.filter((x) => x.simId === sim.id)) {
    items.push({
      type: SimTimelineEventType.PURCHASE,
      titleKey: 'sim.purchase.event',
      amount: p.purchasePrice,
      party: p.sellerPartyName || '',
      dateTime: p.purchaseDate || p.createdAt,
      userName: p.createdByUserName || '',
      status: p.paymentStatus,
      entityId: p.id,
      purchaseId: p.id,
    });
    for (const pay of payments.filter((x) => x.purchaseId === p.id)) {
      items.push({
        type: SimTimelineEventType.PURCHASE_PAYMENT,
        titleKey: 'sim.purchase.payment.event',
        amount: pay.amount,
        party: sellerFor(p.id),
        dateTime: pay.paymentDate || pay.createdAt,
        userName: pay.createdByUserName || '',
        status: '',
        entityId: pay.id,
        purchaseId: p.id,
      });
    }
    for (const r of returns.filter((x) => x.purchaseId === p.id)) {
      items.push({
        type: SimTimelineEventType.PURCHASE_RETURN,
        titleKey: 'sim.purchase.return.event',
        amount: r.returnAmount,
        party: sellerFor(p.id),
        dateTime: r.returnDate || r.createdAt,
        userName: r.createdByUserName || '',
        status: '',
        entityId: r.id,
        purchaseId: p.id,
      });
    }
  }

  if (sim.salePrice != null || sim.saleDate) {
    items.push({
      type: SimTimelineEventType.SALE,
      titleKey: 'sim.sale.event',
      amount: Number(sim.salePrice) || 0,
      party: buyer,
      dateTime: sim.saleDate || sim.createdAt,
      userName: sim.soldByUserName || '',
      status: sim.saleType || '',
      entityId: sim.id,
    });
  }

  for (const sp of salePayments.filter((x) => x.simId === sim.id)) {
    items.push({
      type: SimTimelineEventType.SALE_PAYMENT,
      titleKey: 'sim.sale.payment.event',
      amount: sp.amount,
      party: buyer,
      dateTime: sp.paymentDate || sp.createdAt,
      userName: sp.createdByUserName || '',
      status: sp.receiptType || '',
      entityId: sp.id,
    });
  }

  for (const sr of saleReturns.filter((x) => x.simId === sim.id)) {
    items.push({
      type: SimTimelineEventType.SALE_RETURN,
      titleKey: 'sim.sale.return.event',
      amount: sr.returnAmount,
      party: buyer,
      dateTime: sr.returnDate || sr.createdAt,
      userName: sr.createdByUserName || '',
      status: '',
      entityId: sr.id,
    });
  }

  for (const c of costItems.filter((x) => x.simId === sim.id)) {
    items.push({
      type: SimTimelineEventType.COST,
      titleKey: `sim.cost.${c.side.toLowerCase()}.event`,
      amount: c.amount,
      party: c.description || '',
      dateTime: c.createdAt,
      userName: '',
      status: c.category,
      entityId: c.id,
    });
  }

  if (purchases.filter((x) => x.simId === sim.id).length === 0 && Number(sim.purchasePrice) > 0) {
    items.push({
      type: SimTimelineEventType.LEGACY,
      titleKey: 'sim.purchase.legacy',
      amount: Number(sim.purchasePrice) || 0,
      party: sim.sellerCustomerName || '',
      dateTime: sim.purchaseDate || sim.createdAt,
      userName: sim.purchasedByUserName || '',
      status: 'LEGACY',
      entityId: sim.id,
    });
  }

  return items.sort((a, b) => (a.dateTime < b.dateTime ? 1 : a.dateTime > b.dateTime ? -1 : 0));
}