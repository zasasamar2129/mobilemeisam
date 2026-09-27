import React, { useState, useMemo } from 'react';
import { SimPurchase, SimPurchaseReturn, SimPaymentMethod } from '../../types';
import { storage } from '../../services/storage';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { MoneyInput } from '../ui/MoneyInput';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { JalaliDatePicker } from '../ui/JalaliDatePicker';
import { useToast } from '../ui/Toast';
import { useTranslation } from '../../lib/i18n';
import { computePurchaseRemainingReturnable } from '../../lib/simFinancial';

export interface PurchaseReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchase: SimPurchase;
}

export const PurchaseReturnModal: React.FC<PurchaseReturnModalProps> = ({ isOpen, onClose, purchase }) => {
  const { t } = useTranslation();
  const { success, error } = useToast();

  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString());
  const [reason, setReason] = useState('');
  const [returnAmount, setReturnAmount] = useState<number>(purchase.purchasePrice || 0);
  const [refundedToMMBA, setRefundedToMMBA] = useState<number>(0);
  const [refundMethod, setRefundMethod] = useState<SimPaymentMethod>(SimPaymentMethod.BANK_TRANSFER);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const existingReturns = useMemo(
    () => storage.getPurchaseReturns(purchase.id),
    [purchase.id]
  );
  const remainingReturnable = computePurchaseRemainingReturnable(purchase, existingReturns, purchase.simId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnAmount || returnAmount <= 0) {
      error('مبلغ عودت نامعتبر است.');
      return;
    }
    setIsSubmitting(true);
    try {
      await storage.createPurchaseReturn({
        purchaseId: purchase.id,
        simId: purchase.simId,
        returnDate,
        reason: reason.trim(),
        returnAmount,
        refundedToMMBA,
        refundMethod,
        isPartial: returnAmount < purchase.purchasePrice,
      } as Omit<SimPurchaseReturn, 'id' | 'createdAt' | 'updatedAt'>);
      success('عودت خرید ثبت گردید.');
      onClose();
    } catch (err: any) {
      error(err.message || 'خطا در ثبت عودت خرید');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('sim.purchase.return.title')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="px-3 py-2 rounded-xl bg-surface-subtle border border-border-subtle text-xs text-text-muted flex items-center justify-between">
          <span>{t('sim.purchase.price')}: <b>{purchase.purchasePrice.toLocaleString()}</b></span>
          <span>{t('sim.purchase.remaining')}: <b className="text-warning">{remainingReturnable.toLocaleString()}</b></span>
        </div>

        <div>
          <label className="text-xs font-semibold text-text-secondary block mb-1">{t('sim.purchase.return.date')}</label>
          <JalaliDatePicker value={returnDate} onChange={setReturnDate} />
        </div>
        <Textarea label={t('sim.purchase.return.reason')} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MoneyInput label={t('sim.purchase.return.amount')} value={returnAmount} onChange={setReturnAmount} required />
          <MoneyInput label={t('sim.purchase.return.refundedToM')} value={refundedToMMBA} onChange={setRefundedToMMBA} />
        </div>

        <Select
          label={t('sim.purchase.return.method')}
          value={refundMethod}
          onChange={(e) => setRefundMethod(e.target.value as SimPaymentMethod)}
          options={[
            { value: SimPaymentMethod.BANK_TRANSFER, label: 'انتقال بانکی' },
            { value: SimPaymentMethod.CARD_READER, label: 'کارت‌خوان / پوز' },
            { value: SimPaymentMethod.CASH, label: 'نقدی' },
            { value: SimPaymentMethod.PAYA, label: 'پایا / ساتنا' },
          ]}
        />

        {returnAmount < purchase.purchasePrice && (
          <p className="text-xs px-3 py-2 rounded-lg bg-warning/10 text-warning">
            {t('sim.purchase.return.partial')}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
          <Button variant="ghost" onClick={onClose} type="button">{t('common.cancel')}</Button>
          <Button variant="danger" type="submit" isLoading={isSubmitting}>{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  );
};