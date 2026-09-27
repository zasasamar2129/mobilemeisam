import React, { useState } from 'react';
import { SimCard, SimPaymentMethod } from '../../types';
import { storage } from '../../services/storage';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { MoneyInput } from '../ui/MoneyInput';
import { Input } from '../ui/Input';
import { JalaliDatePicker } from '../ui/JalaliDatePicker';
import { useToast } from '../ui/Toast';
import { useTranslation } from '../../lib/i18n';

export interface SalePaymentModalProps {
  sim: SimCard;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const SalePaymentModal: React.FC<SalePaymentModalProps> = ({ sim, isOpen, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const { success, error } = useToast();

  const summary = storage.getSimFinancialSummary(sim.id);
  const receivable = summary.saleReceivable;

  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState<string>(new Date().toISOString());
  const [method, setMethod] = useState<SimPaymentMethod>(SimPaymentMethod.BANK_TRANSFER);
  const [reference, setReference] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      error('مبلغ دریافت نامعتبر است.');
      return;
    }
    setIsSubmitting(true);
    try {
      await storage.addSalePayment({
        simId: sim.id,
        amount,
        paymentDate: date,
        method,
        referenceNumber: reference.trim(),
        receiptType: 'SALE',
      });
      success('دریافت فروش ثبت گردید.');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      error(err.message || 'خطا در ثبت دریافت');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('sim.sale.payment.title')} size="md">
      <div className="mb-3 px-3 py-2 rounded-xl bg-surface-subtle border border-border-subtle text-xs text-text-muted flex items-center justify-between">
        <span>{t('sim.sale.payment.received')}: <b>{summary.saleReceived.toLocaleString()}</b></span>
        <span>{t('sim.sale.payment.receivable')}: <b className="text-warning">{receivable.toLocaleString()}</b></span>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <MoneyInput label={t('sim.sale.payment.amount')} value={amount} onChange={setAmount} required />
        <div>
          <label className="text-xs font-semibold text-text-secondary block mb-1">{t('common.date')}</label>
          <JalaliDatePicker value={date} onChange={setDate} />
        </div>
        <Select
          label={t('common.method')}
          value={method}
          onChange={(e) => setMethod(e.target.value as SimPaymentMethod)}
          options={[
            { value: SimPaymentMethod.BANK_TRANSFER, label: 'انتقال بانکی' },
            { value: SimPaymentMethod.CARD_READER, label: 'کارت‌خوان / پوز' },
            { value: SimPaymentMethod.CASH, label: 'نقدی' },
            { value: SimPaymentMethod.CHECK, label: 'چک' },
            { value: SimPaymentMethod.ONLINE_GATEWAY, label: 'درگاه آنلاین' },
          ]}
        />
        <Input label={t('common.reference')} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="شماره رسید / پیگیری" />

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
          <Button variant="ghost" onClick={onClose} type="button">{t('common.cancel')}</Button>
          <Button variant="primary" type="submit" isLoading={isSubmitting}>{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  );
};