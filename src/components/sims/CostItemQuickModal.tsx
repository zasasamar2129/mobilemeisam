import React, { useState } from 'react';
import { SimCard, SimCostItem } from '../../types';
import { storage } from '../../services/storage';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { MoneyInput } from '../ui/MoneyInput';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import { useTranslation } from '../../lib/i18n';

export interface CostItemQuickModalProps {
  sim: SimCard;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CostItemQuickModal: React.FC<CostItemQuickModalProps> = ({ sim, isOpen, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const { success, error } = useToast();

  const [side, setSide] = useState<'PURCHASE' | 'SALE'>('PURCHASE');
  const [category, setCategory] = useState<SimCostItem['category']>('COMMISSION');
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      error('مبلغ هزینه نامعتبر است.');
      return;
    }
    setIsSubmitting(true);
    try {
      await storage.addSimCostItem({
        simId: sim.id,
        side,
        category,
        amount,
        description: description.trim(),
      });
      success('هزینه جانبی ثبت گردید.');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      error(err.message || 'خطا در ثبت هزینه');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('sim.cost.title')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label={t('sim.cost.side')}
            value={side}
            onChange={(e) => setSide(e.target.value as 'PURCHASE' | 'SALE')}
            options={[
              { value: 'PURCHASE', label: t('sim.cost.purchase.side') },
              { value: 'SALE', label: t('sim.cost.sale.side') },
            ]}
          />
          <Select
            label={t('sim.cost.category')}
            value={category}
            onChange={(e) => setCategory(e.target.value as SimCostItem['category'])}
            options={[
              { value: 'COMMISSION', label: t('sim.cost.category.COMMISSION') },
              { value: 'TRANSFER', label: t('sim.cost.category.TRANSFER') },
              { value: 'REGISTRATION', label: t('sim.cost.category.REGISTRATION') },
              { value: 'DELIVERY', label: t('sim.cost.category.DELIVERY') },
              { value: 'OTHER', label: t('sim.cost.category.OTHER') },
            ]}
          />
        </div>
        <MoneyInput label={t('sim.cost.amount')} value={amount} onChange={setAmount} required />
        <Input label={t('sim.cost.description')} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="توضیح هزینه..." />

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
          <Button variant="ghost" onClick={onClose} type="button">{t('common.cancel')}</Button>
          <Button variant="primary" type="submit" isLoading={isSubmitting}>{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  );
};