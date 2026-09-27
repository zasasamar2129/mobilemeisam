import React, { useState, useMemo } from 'react';
import { SimCard, SimSaleReturn, SimPaymentMethod, SimReturnInventoryStatus } from '../../types';
import { storage } from '../../services/storage';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { MoneyInput } from '../ui/MoneyInput';
import { Textarea } from '../ui/Textarea';
import { JalaliDatePicker } from '../ui/JalaliDatePicker';
import { useToast } from '../ui/Toast';
import { useTranslation } from '../../lib/i18n';

export interface SaleReturnModalProps {
  sim: SimCard;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const SaleReturnModal: React.FC<SaleReturnModalProps> = ({ sim, isOpen, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const { success, error } = useToast();

  const summary = storage.getSimFinancialSummary(sim.id);

  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString());
  const [reason, setReason] = useState('');
  const [returnAmount, setReturnAmount] = useState<number>(Number(sim.salePrice) || 0);
  const [refundedToCustomer, setRefundedToCustomer] = useState<number>(0);
  const [refundMethod, setRefundMethod] = useState<SimPaymentMethod>(SimPaymentMethod.BANK_TRANSFER);
  const [inventoryStatusAfter, setInventoryStatusAfter] = useState<SimReturnInventoryStatus>(SimReturnInventoryStatus.BACK_TO_AVAILABLE);
  const [ownerStatusAfter, setOwnerStatusAfter] = useState('OWNED_BY_MMBA');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const used = useMemo(() => storage.getSaleReturns(sim.id), [sim.id]);
  const alreadyReturned = used.reduce((a, r) => a + (Number(r.returnAmount) || 0), 0);
  const remainingReturnable = Math.max(0, summary.saleRevenue - alreadyReturned);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnAmount || returnAmount <= 0) {
      error('مبلغ برگشت نامعتبر است.');
      return;
    }
    setIsSubmitting(true);
    try {
      await storage.createSaleReturn({
        simId: sim.id,
        returnDate,
        reason: reason.trim(),
        returnAmount,
        refundedToCustomer,
        refundMethod,
        inventoryStatusAfter,
        ownerStatusAfter,
        isPartial: returnAmount < summary.saleRevenue,
      } as Omit<SimSaleReturn, 'id' | 'createdAt' | 'updatedAt' | 'priorReceipts'>);
      success('برگشت فروش ثبت گردید.');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      error(err.message || 'خطا در ثبت برگشت فروش');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('sim.sale.return.title')} size="lg">
      <div className="mb-3 px-3 py-2 rounded-xl bg-surface-subtle border border-border-subtle text-xs text-text-muted flex items-center justify-between">
        <span>{t('sim.financial.saleRevenue')}: <b>{summary.saleRevenue.toLocaleString()}</b></span>
        <span>{t('sim.sale.payment.received')}: <b>{summary.saleReceived.toLocaleString()}</b></span>
        <span>{t('sim.sale.return.amount')} (باقیمانده): <b className="text-warning">{remainingReturnable.toLocaleString()}</b></span>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-text-secondary block mb-1">{t('sim.sale.return.date')}</label>
          <JalaliDatePicker value={returnDate} onChange={setReturnDate} />
        </div>
        <Textarea label={t('sim.sale.return.reason')} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MoneyInput label={t('sim.sale.return.amount')} value={returnAmount} onChange={setReturnAmount} required />
          <MoneyInput label={t('sim.sale.return.refundedToC')} value={refundedToCustomer} onChange={setRefundedToCustomer} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label={t('sim.sale.return.method')}
            value={refundMethod}
            onChange={(e) => setRefundMethod(e.target.value as SimPaymentMethod)}
            options={[
              { value: SimPaymentMethod.BANK_TRANSFER, label: 'انتقال بانکی' },
              { value: SimPaymentMethod.CASH, label: 'نقدی' },
              { value: SimPaymentMethod.PAYA, label: 'پایا / ساتنا' },
            ]}
          />
          <Select
            label={t('sim.sale.return.inventoryAfter')}
            value={inventoryStatusAfter}
            onChange={(e) => setInventoryStatusAfter(e.target.value as SimReturnInventoryStatus)}
            options={[
              { value: SimReturnInventoryStatus.BACK_TO_AVAILABLE, label: t('sim.inventory.status.backToAvailable') },
              { value: SimReturnInventoryStatus.PENDING_INSPECTION, label: t('sim.inventory.status.pendingInspection') },
              { value: SimReturnInventoryStatus.SCRAPPED, label: t('sim.inventory.status.scrapped') },
              { value: SimReturnInventoryStatus.LOST, label: t('sim.inventory.status.lost') },
            ]}
          />
        </div>

        <Select
          label={t('sim.sale.return.ownerAfter')}
          value={ownerStatusAfter}
          onChange={(e) => setOwnerStatusAfter(e.target.value)}
          options={[
            { value: 'OWNED_BY_MMBA', label: 'مالکیت MMBA' },
            { value: 'PENDING_NAME_TRANSFER', label: 'در انتظار انتقال سند' },
            { value: 'UNDER_DISPUTE', label: 'در اختلاف / تعلیق' },
          ]}
        />

        {returnAmount < summary.saleRevenue && (
          <p className="text-xs px-3 py-2 rounded-lg bg-warning/10 text-warning">{t('sim.sale.return.partial')}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
          <Button variant="ghost" onClick={onClose} type="button">{t('common.cancel')}</Button>
          <Button variant="danger" type="submit" isLoading={isSubmitting}>{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  );
};