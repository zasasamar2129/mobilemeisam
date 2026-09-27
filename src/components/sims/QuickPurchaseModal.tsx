import React, { useState } from 'react';
import { SimCard, SimPaymentMethod } from '../../types';
import { storage } from '../../services/storage';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { MoneyInput } from '../ui/MoneyInput';
import { JalaliDatePicker } from '../ui/JalaliDatePicker';
import { useToast } from '../ui/Toast';
import { useTranslation } from '../../lib/i18n';

export interface QuickPurchaseModalProps {
  sim: SimCard;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const QuickPurchaseModal: React.FC<QuickPurchaseModalProps> = ({ sim, isOpen, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const { success, error } = useToast();

  const [sellerName, setSellerName] = useState(sim.sellerCustomerName || '');
  const [sellerPhone, setSellerPhone] = useState('');
  const [purchasePrice, setPurchasePrice] = useState<number>(sim.purchasePrice || 0);
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString());
  const [method, setMethod] = useState<SimPaymentMethod>(SimPaymentMethod.BANK_TRANSFER);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchasePrice || purchasePrice <= 0) {
      error('قیمت خرید نامعتبر است.');
      return;
    }
    if (!sellerName.trim()) {
      error('نام فروشنده الزامی است.');
      return;
    }
    setIsSubmitting(true);
    try {
      const p = await storage.createSimPurchase({
        simId: sim.id,
        sellerPartyName: sellerName.trim(),
        sellerPhone: sellerPhone.trim(),
        purchasePrice,
        purchaseDate,
        notes: notes.trim(),
      });
      if (amountPaid > 0) {
        await storage.addPurchasePayment({
          purchaseId: p.id,
          amount: amountPaid,
          method,
          paymentDate: purchaseDate,
          note: 'پرداخت نقدی هنگام ثبت خرید',
        });
      }
      success('خرید سیم‌کارت با موفقیت ثبت گردید.');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      error(err.message || 'خطا در ثبت خرید');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${t('sim.purchase.title')} — ${sim.phoneNumber}`} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label={t('sim.purchase.sellerName')}
            value={sellerName}
            onChange={(e) => setSellerName(e.target.value)}
            isRequired
            placeholder="نام یا فروشگاه طرف حساب"
          />
          <Input
            label={t('sim.purchase.sellerPhone')}
            value={sellerPhone}
            onChange={(e) => setSellerPhone(e.target.value)}
            placeholder="۰۹..."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MoneyInput
            label={t('sim.purchase.price')}
            value={purchasePrice}
            onChange={setPurchasePrice}
            required
          />
          <div>
            <label className="text-xs font-semibold text-text-secondary block mb-1">{t('sim.purchase.date')}</label>
            <JalaliDatePicker value={purchaseDate} onChange={setPurchaseDate} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <MoneyInput
            label={t('sim.purchase.amountPaid')}
            value={amountPaid}
            onChange={setAmountPaid}
          />
        </div>

        <Textarea
          label={t('sim.purchase.notes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="توضیحات و شرایط معامله..."
        />

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
          <Button variant="ghost" onClick={onClose} type="button">
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" isLoading={isSubmitting}>
            {t('sim.purchase.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};