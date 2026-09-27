import React, { useState } from 'react';
import { SimPurchase, SimPaymentMethod } from '../../types';
import { storage } from '../../services/storage';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { MoneyInput } from '../ui/MoneyInput';
import { Input } from '../ui/Input';
import { JalaliDatePicker } from '../ui/JalaliDatePicker';
import { useToast } from '../ui/Toast';
import { useTranslation } from '../../lib/i18n';

export interface PurchasePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchase: SimPurchase;
}

export const PurchasePaymentModal: React.FC<PurchasePaymentModalProps> = ({ isOpen, onClose, purchase }) => {
  const { t } = useTranslation();
  const { success, error } = useToast();

  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState<string>(new Date().toISOString());
  const [method, setMethod] = useState<SimPaymentMethod>(SimPaymentMethod.BANK_TRANSFER);
  const [reference, setReference] = useState('');
  const [bank, setBank] = useState('');
  const [account, setAccount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      error('مبلغ پرداخت نامعتبر است.');
      return;
    }
    setIsSubmitting(true);
    try {
      await storage.addPurchasePayment({
        purchaseId: purchase.id,
        amount,
        paymentDate: date,
        method,
        referenceNumber: reference.trim(),
        bankName: bank.trim(),
        destinationAccount: account.trim(),
      });
      success('پرداخت خرید ثبت گردید.');
      onClose();
    } catch (err: any) {
      error(err.message || 'خطا در ثبت پرداخت');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('sim.purchase.payment.title')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <MoneyInput label={t('sim.purchase.payment.amount')} value={amount} onChange={setAmount} required />
        <div>
          <label className="text-xs font-semibold text-text-secondary block mb-1">{t('sim.purchase.date')}</label>
          <JalaliDatePicker value={date} onChange={setDate} />
        </div>
        <Select
          label={t('sim.purchase.method')}
          value={method}
          onChange={(e) => setMethod(e.target.value as SimPaymentMethod)}
          options={[
            { value: SimPaymentMethod.BANK_TRANSFER, label: 'انتقال بانکی' },
            { value: SimPaymentMethod.CARD_READER, label: 'کارت‌خوان / پوز' },
            { value: SimPaymentMethod.CASH, label: 'نقدی' },
            { value: SimPaymentMethod.CHECK, label: 'چک' },
            { value: SimPaymentMethod.PAYA, label: 'پایا / ساتنا' },
            { value: SimPaymentMethod.BARTER, label: 'تهاتر / معاوضه' },
            { value: SimPaymentMethod.OTHER, label: 'سایر' },
          ]}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label={t('common.reference')} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="شماره رسید / پیگیری" />
          <Input label={t('common.bank')} value={bank} onChange={(e) => setBank(e.target.value)} />
        </div>
        <Input label={t('common.account')} value={account} onChange={(e) => setAccount(e.target.value)} placeholder="شماره حساب / کارت مقصد" />

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
          <Button variant="ghost" onClick={onClose} type="button">{t('common.cancel')}</Button>
          <Button variant="primary" type="submit" isLoading={isSubmitting}>{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  );
};