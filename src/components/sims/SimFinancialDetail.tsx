import React, { useState, useEffect, useMemo } from 'react';
import { SimCard, User } from '../../types';
import { storage } from '../../services/storage';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { Tabs } from '../ui/Tabs';
import { SummaryCard } from '../ui/SummaryCard';
import { Timeline } from '../ui/Timeline';
import { StatusBadge, STATUS_TONES } from '../ui/StatusBadge';
import { Tooltip } from '../ui/Tooltip';
import { Skeleton } from '../ui/Skeleton';
import { useTranslation } from '../../lib/i18n';
import { formatPersianDate, isOverdue } from '../../lib/dateUtils';
import {
  computeDeedTransferEligibility,
  computeDeedFollowStatus,
  deedFollowStatusLabelFa,
  deedEligibilityStatusLabelFa,
  deedRemainingLabelFa,
} from '../../lib/deedTransfer';
import { canViewSimProfit, canPerformSimFinancialAction, PERMISSION_KEYS } from '../../lib/permissions';
import {
  ShoppingCart, CreditCard, Wallet, ArrowDownToLine, ArrowUpFromLine,
  Undo2, RotateCcw, PlusCircle, BarChart3, History, Zap, Info,
} from 'lucide-react';

import { QuickPurchaseModal } from './QuickPurchaseModal';
import { PurchasePaymentModal } from './PurchasePaymentModal';
import { SalePaymentModal } from './SalePaymentModal';
import { PurchaseReturnModal } from './PurchaseReturnModal';
import { SaleReturnModal } from './SaleReturnModal';
import { CostItemQuickModal } from './CostItemQuickModal';

export interface SimFinancialDetailProps {
  sim: SimCard;
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onSimUpdated?: () => void;
}

type FinTab = 'overview' | 'timeline' | 'actions';

export const SimFinancialDetail: React.FC<SimFinancialDetailProps> = ({ sim, isOpen, onClose, currentUser, onSimUpdated }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<FinTab>('overview');
  const [refreshKey, setRefreshKey] = useState(0);

  // Sub-modal state
  const [showQuickPurchase, setShowQuickPurchase] = useState(false);
  const [showPurchasePayment, setShowPurchasePayment] = useState(false);
  const [showSalePayment, setShowSalePayment] = useState(false);
  const [showPurchaseReturn, setShowPurchaseReturn] = useState(false);
  const [showSaleReturn, setShowSaleReturn] = useState(false);
  const [showCostItem, setShowCostItem] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const currentPurchase = useMemo(() => storage.getCurrentPurchaseForSim(sim.id), [sim.id, refreshKey]);

  // Always compute locally; timeline is derived fresh.
  const summary = useMemo(() => {
    try {
      return storage.getSimFinancialSummary(sim.id);
    } catch {
      return null;
    }
  }, [sim.id, refreshKey]);

  /**
   * Derived eligibility — the same pure function the API, the scheduler and the
   * list column use, so the drawer can never contradict them.
   */
  const deedEligibility = useMemo(() => computeDeedTransferEligibility(sim), [sim]);
  const deedFollow = useMemo(() => computeDeedFollowStatus(sim), [sim]);

  const timelineItems = useMemo(() => {
    try {
      return storage.getSimFinancialTimeline(sim.id);
    } catch {
      return [];
    }
  }, [sim.id, refreshKey]);

  useEffect(() => {
    setActiveTab('overview');
    setTimelineLoading(true);
    const timer = setTimeout(() => setTimelineLoading(false), 250);
    return () => clearTimeout(timer);
  }, [isOpen, sim.id]);

  const handleChanged = () => {
    setRefreshKey((k) => k + 1);
    onSimUpdated?.();
  };

  const canViewProfit = canViewSimProfit(currentUser);
  const canPurchase = canPerformSimFinancialAction(currentUser, PERMISSION_KEYS.SIM_PURCHASE_CREATE);
  const canPurchasePay = canPerformSimFinancialAction(currentUser, PERMISSION_KEYS.SIM_PURCHASE_PAYMENT_CREATE);
  const canPurchaseReturn = canPerformSimFinancialAction(currentUser, PERMISSION_KEYS.SIM_PURCHASE_RETURN_CREATE);
  const canSalePay = canPerformSimFinancialAction(currentUser, PERMISSION_KEYS.SIM_SALE_PAYMENT_CREATE);
  const canSaleReturn = canPerformSimFinancialAction(currentUser, PERMISSION_KEYS.SIM_SALE_RETURN_CREATE);
  const canCost = canPerformSimFinancialAction(currentUser, PERMISSION_KEYS.SIM_FINANCIAL_ADJUST);

  const hasSale = !!(sim.salePrice != null || sim.saleDate);

  const tabs: { id: string; label: string; icon?: React.ReactNode }[] = [
    { id: 'overview', label: t('sim.financial.overview'), icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'timeline', label: t('sim.financial.timeline'), icon: <History className="w-4 h-4" /> },
    { id: 'actions', label: t('sim.financial.actions'), icon: <Zap className="w-4 h-4" /> },
  ];

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} title={`${t('sim.financial.title')} — ${sim.phoneNumber}`}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Tabs tabs={tabs} activeId={activeTab} onChange={(id) => setActiveTab(id as FinTab)} />
            <Tooltip content={t('sim.financial.viewProfit')}>
              <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                <Info className="w-3.5 h-3.5" /> {sim.status}
              </span>
            </Tooltip>
          </div>

          {activeTab === 'overview' && (
            <div className="space-y-4">
              {summary ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <SummaryCard
                      label={t('sim.financial.purchaseCost')}
                      value={summary.purchaseCost?.toLocaleString() ?? '—'}
                      isIncomplete={summary.historicalMissingPurchaseCost}
                      tone="neutral"
                    />
                    <SummaryCard
                      label={t('sim.financial.saleRevenue')}
                      value={(summary.saleRevenue ?? 0) > 0 ? summary.saleRevenue.toLocaleString() : '—'}
                      tone={hasSale ? 'success' : 'neutral'}
                    />
                    <SummaryCard
                      label={t('sim.financial.grossMargin')}
                      value={summary.grossMargin != null ? summary.grossMargin.toLocaleString() : 'N/A'}
                      tone={summary.grossMargin != null ? (summary.grossMargin >= 0 ? 'success' : 'danger') : 'neutral'}
                      isIncomplete={summary.historicalMissingPurchaseCost}
                    />
                  </div>

                  {/* Ownership-transfer follow-up (سند مالکیت).
                      The due date is the operator's hand-chosen follow-up date and
                      drives the status. The calculated legal eligibility is shown
                      below it, separately and as advisory context only, because it
                      is a different fact from the date the operator chose. */}
                  <div
                    className="px-3 py-2 rounded-xl border bg-surface-subtle space-y-1.5"
                    data-testid="sim-deed-status"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-text-muted">انتقال سند مالکیت:</span>
                      <span
                        className={
                          deedFollow.status === 'COMPLETED'
                            ? 'font-semibold text-success'
                            : deedFollow.status === 'OVERDUE'
                            ? 'font-bold text-rose-600 dark:text-rose-400'
                            : deedFollow.status === 'DUE_TODAY'
                            ? 'font-semibold text-warning'
                            : 'text-text-muted'
                        }
                        data-testid="sim-deed-follow-status"
                      >
                        {deedFollowStatusLabelFa(deedFollow.status)}
                        {deedFollow.remainingDays !== null &&
                          ` — ${deedRemainingLabelFa(deedFollow.remainingDays)}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-1.5 text-[10px] pt-1 border-t border-border-subtle">
                      <div className="flex flex-col">
                        <span className="text-text-muted">سررسید انتخابی (دستی)</span>
                        <span className="font-mono text-text-secondary" dir="ltr" data-testid="sim-deed-due-date">
                          {sim.deedTransferDueDate ? formatPersianDate(sim.deedTransferDueDate, true) : '—'}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-text-muted">تاریخ خرید</span>
                        <span className="font-mono text-text-secondary" dir="ltr">
                          {sim.purchaseDate ? formatPersianDate(sim.purchaseDate, true) : '—'}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-text-muted">انتقال سند قبلی (مبنا)</span>
                        <span className="font-mono text-text-secondary" dir="ltr">
                          {sim.previousTransferDate ? formatPersianDate(sim.previousTransferDate, true) : '—'}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-text-muted">مجاز قانونی از</span>
                        <span className="font-mono text-text-secondary" dir="ltr" data-testid="sim-deed-next-eligible">
                          {deedEligibility.nextEligibleDate
                            ? formatPersianDate(deedEligibility.nextEligibleDate, true)
                            : '—'}
                        </span>
                      </div>
                    </div>

                    {!sim.deedTransferCompletedAt &&
                      !sim.deedTransferDueDate &&
                      deedEligibility.status !== 'UNKNOWN' && (
                        <p className="text-[10px] text-text-muted" data-testid="sim-deed-no-due-date">
                          تاریخ سررسید انتخاب نشده است؛ برای زمان‌بندی یادآوری، آن را ثبت کنید.
                        </p>
                      )}

                    {deedEligibility.needsVerification && !sim.deedTransferCompletedAt && (
                      <p className="text-[10px] font-semibold text-warning" data-testid="sim-deed-needs-verification">
                        {deedEligibility.baseSource === 'PURCHASE_FALLBACK'
                          ? 'تاریخ انتقال سند قبلی ثبت نشده است؛ محاسبه موقتاً بر پایه تاریخ خرید انجام شده و نیازمند بررسی است.'
                          : 'برای این پرونده مبنای محاسبه ثبت نشده است؛ وضعیت مجاز قابل محاسبه نیست.'}
                      </p>
                    )}

                    {deedEligibility.needsVerification && !sim.deedTransferCompletedAt && (
                      <p className="text-[10px] font-semibold text-warning" data-testid="sim-deed-needs-verification">
                        {deedEligibility.baseSource === 'PURCHASE_FALLBACK'
                          ? 'تاریخ انتقال سند قبلی ثبت نشده است؛ محاسبه موقتاً بر پایه تاریخ خرید انجام شده و نیازمند بررسی است.'
                          : 'برای این پرونده مبنای محاسبه ثبت نشده است؛ مهلت ۲۰ روزه قابل محاسبه نیست.'}
                      </p>
                    )}

                    {sim.deedTransferOverride && sim.deedTransferOverrideReason && (
                      <p className="text-[10px] text-text-muted">
                        استثنای مصوب: {sim.deedTransferOverrideReason}
                        {sim.deedTransferOverrideByUserId ? ` — توسط ${sim.deedTransferOverrideByUserId}` : ''}
                      </p>
                    )}
                  </div>

                  {(summary.purchaseBalance > 0 || summary.saleReceivable > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {summary.purchaseBalance > 0 && (
                        <div className="app-card p-3 flex flex-col gap-1">
                          <span className="text-text-muted text-xs">{t('sim.purchase.paid')}: {summary.purchasePaid.toLocaleString()}</span>
                          <span className="flex items-center gap-2 text-sm font-semibold text-warning">
                            {t('sim.financial.purchaseBalance')}: {summary.purchaseBalance.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {summary.saleReceivable > 0 && (
                        <div className="app-card p-3 flex flex-col gap-1">
                          <span className="text-text-muted text-xs">{t('sim.sale.payment.received')}: {summary.saleReceived.toLocaleString()}</span>
                          <span className="flex items-center gap-2 text-sm font-semibold text-warning">
                            {t('sim.financial.saleReceivable')}: {summary.saleReceivable.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {summary.historicalMissingPurchaseCost && (
                    <p className="text-xs px-3 py-2 rounded-lg bg-warning/10 text-warning">{t('sim.financial.incomplete')}</p>
                  )}

                  {currentPurchase && (
                    <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-subtle border border-border-subtle">
                      <span className="text-xs text-text-muted">
                        {t('sim.purchase.title')}: {currentPurchase.sellerPartyName || '—'}
                      </span>
                      <StatusBadge status={currentPurchase.paymentStatus} tone={STATUS_TONES[currentPurchase.paymentStatus]} />
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="w-full h-20" />
                  <Skeleton className="w-full h-20" />
                  <Skeleton className="w-full h-20" />
                </div>
              )}
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="space-y-3">
              {timelineLoading ? (
                <div className="space-y-2">
                  <Skeleton className="w-full h-10" />
                  <Skeleton className="w-full h-10" />
                  <Skeleton className="w-full h-10" />
                </div>
              ) : (
                <Timeline
                  key={refreshKey}
                  items={timelineItems.map((item) => ({
                    id: item.entityId || `${item.type}-${item.dateTime}`,
                    typeLabel: item.type,
                    title: t(item.titleKey),
                    amount: item.amount,
                    party: item.party || undefined,
                    dateTime: item.dateTime,
                    userName: item.userName || undefined,
                    status: item.status || undefined,
                    statusTone: STATUS_TONES[item.status] || 'neutral',
                  }))}
                />
              )}
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {canPurchase && (
                <button onClick={() => setShowQuickPurchase(true)} className="app-card p-3 flex flex-col items-start gap-1 hover:border-primary transition-colors">
                  <ShoppingCart className="w-5 h-5 text-primary" />
                  <span className="text-xs font-semibold text-text-primary">{t('sim.qactions.purchaseCreate')}</span>
                </button>
              )}
              {canPurchase && currentPurchase && (
                <button onClick={() => setShowPurchasePayment(true)} className="app-card p-3 flex flex-col items-start gap-1 hover:border-primary transition-colors">
                  <CreditCard className="w-5 h-5 text-primary" />
                  <span className="text-xs font-semibold text-text-primary">{t('sim.qactions.purchasePay')}</span>
                </button>
              )}
              {canSalePay && hasSale && (
                <button onClick={() => setShowSalePayment(true)} className="app-card p-3 flex flex-col items-start gap-1 hover:border-primary transition-colors">
                  <ArrowDownToLine className="w-5 h-5 text-success" />
                  <span className="text-xs font-semibold text-text-primary">{t('sim.qactions.saleReceive')}</span>
                </button>
              )}
              {canPurchaseReturn && currentPurchase && (
                <button onClick={() => setShowPurchaseReturn(true)} className="app-card p-3 flex flex-col items-start gap-1 hover:border-danger transition-colors">
                  <Undo2 className="w-5 h-5 text-warning" />
                  <span className="text-xs font-semibold text-text-primary">{t('sim.qactions.returnPurchase')}</span>
                </button>
              )}
              {canSaleReturn && hasSale && (
                <button onClick={() => setShowSaleReturn(true)} className="app-card p-3 flex flex-col items-start gap-1 hover:border-danger transition-colors">
                  <RotateCcw className="w-5 h-5 text-danger" />
                  <span className="text-xs font-semibold text-text-primary">{t('sim.qactions.returnSale')}</span>
                </button>
              )}
              {canCost && (
                <button onClick={() => setShowCostItem(true)} className="app-card p-3 flex flex-col items-start gap-1 hover:border-primary transition-colors">
                  <PlusCircle className="w-5 h-5 text-accent" />
                  <span className="text-xs font-semibold text-text-primary">{t('sim.qactions.costAdd')}</span>
                </button>
              )}
              <button
                onClick={() => (window.location.href = `/sims?financial=${sim.id}`)}
                className="app-card p-3 flex flex-col items-start gap-1 hover:border-primary transition-colors"
              >
                <Wallet className="w-5 h-5 text-info" />
                <span className="text-xs font-semibold text-text-primary">{t('sim.qactions.financialView')}</span>
              </button>
              {!hasSale && canPurchase && (
                <button className="app-card p-3 flex flex-col items-start gap-1 hover:border-primary transition-colors opacity-60 cursor-default" aria-disabled>
                  <ArrowUpFromLine className="w-5 h-5 text-muted" />
                  <span className="text-xs font-semibold text-text-primary">{t('sim.qactions.saleCreate')}</span>
                  <span className="text-[10px] text-text-muted">(در Sim List ثبت می‌شود)</span>
                </button>
              )}
            </div>
          )}
        </div>
      </Drawer>

      <QuickPurchaseModal sim={sim} isOpen={showQuickPurchase} onClose={() => setShowQuickPurchase(false)} onSuccess={handleChanged} />
      {currentPurchase && (
        <PurchasePaymentModal purchase={currentPurchase} isOpen={showPurchasePayment} onClose={() => setShowPurchasePayment(false)} />
      )}
      <SalePaymentModal sim={sim} isOpen={showSalePayment} onClose={() => setShowSalePayment(false)} onSuccess={handleChanged} />
      {currentPurchase && (
        <PurchaseReturnModal purchase={currentPurchase} isOpen={showPurchaseReturn} onClose={() => setShowPurchaseReturn(false)} />
      )}
      <SaleReturnModal sim={sim} isOpen={showSaleReturn} onClose={() => setShowSaleReturn(false)} onSuccess={handleChanged} />
      <CostItemQuickModal sim={sim} isOpen={showCostItem} onClose={() => setShowCostItem(false)} onSuccess={handleChanged} />

      {!canViewProfit && (
        <div className="hidden">{/* Financial figures redacted for unprivileged roles */}</div>
      )}
    </>
  );
};