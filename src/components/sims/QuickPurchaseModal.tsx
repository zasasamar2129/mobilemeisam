import React, { useMemo, useState } from 'react';
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
import { cleanDigits } from '../../lib/numberUtils';
import {
  computeDeedTransferEligibility,
  computeDeedFollowStatus,
  validateDeedTransferDueDate,
  deedFollowStatusLabelFa,
  deedRemainingLabelFa,
  MAX_DEED_TRANSFER_DAYS,
} from '../../lib/deedTransfer';
import { formatPersianDate } from '../../lib/dateUtils';

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
  // The previous ownership transfer — NOT the purchase date. Used only to
  // display the calculated legal eligibility; deliberately optional, because an
  // unknown date is flagged rather than guessed.
  const [previousTransferDate, setPreviousTransferDate] = useState(sim.previousTransferDate || '');
  // The operator's hand-chosen follow-up date. Chosen here so a newly purchased
  // SIM can carry a due date from the start; it is stored verbatim and is never
  // derived from the purchase date or the waiting-period rule.
  const [deedTransferDueDate, setDeedTransferDueDate] = useState(sim.deedTransferDueDate || '');

  // Live preview of what the operator is about to create, so both the chosen
  // follow-up status and the calculated eligibility are visible BEFORE saving.
  const eligibilityPreview = useMemo(
    () => computeDeedTransferEligibility({ previousTransferDate, purchaseDate }),
    [previousTransferDate, purchaseDate]
  );
  const followPreview = useMemo(
    () => computeDeedFollowStatus({ deedTransferDueDate, deedTransferCompletedAt: '' }),
    [deedTransferDueDate]
  );
  const dueCheck = useMemo(
    () => validateDeedTransferDueDate({ previousTransferDate, purchaseDate, deedTransferDueDate }),
    [previousTransferDate, purchaseDate, deedTransferDueDate]
  );

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
      // Purchasing is never blocked by transfer ineligibility — the SIM may be
      // bought today while the next transfer is still 15 days away. Only the
      // previous-transfer date is captured, and its absence is flagged.
      const p = await storage.createSimPurchase({
        simId: sim.id,
        sellerPartyName: sellerName.trim(),
        sellerPhone: sellerPhone.trim(),
        purchasePrice,
        purchaseDate,
        previousTransferDate: previousTransferDate || undefined,
        deedTransferDueDate: deedTransferDueDate || undefined,
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
            onChange={(e) => setSellerPhone(cleanDigits(e.target.value))}
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

        {/* Ownership-transfer follow-up. The due date is the operator's choice,
            entered here and stored verbatim — never calculated from the purchase
            date or the waiting-period rule. The calculated legal eligibility is
            shown underneath as advisory context only. */}
        <div
          className="p-3.5 rounded-2xl bg-slate-50 dark:bg-surface-subtle/80 border border-primary space-y-2.5"
          data-testid="purchase-previous-transfer"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="text-xs font-bold text-primary">تاریخ سررسید انتقال سند</label>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                followPreview.status === 'DUE_TODAY'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : followPreview.status === 'OVERDUE'
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                  : followPreview.status === 'WAITING'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-500/10 text-muted border-slate-400/30'
              }`}
              data-testid="purchase-follow-status"
            >
              {deedFollowStatusLabelFa(followPreview.status)}
            </span>
          </div>

          <JalaliDatePicker
            value={deedTransferDueDate}
            onChange={setDeedTransferDueDate}
            placeholder="انتخاب تاریخ پیگیری انتقال سند"
            helperText="تاریخ را به‌صورت دستی و متناسب با برنامه‌ریزی عملیاتی خود انتخاب کنید."
          />

          {followPreview.remainingDays !== null && (
            <p
              className={`text-[11px] font-semibold ${
                followPreview.status === 'OVERDUE'
                  ? 'text-rose-600 dark:text-rose-400'
                  : followPreview.status === 'DUE_TODAY'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-muted'
              }`}
              data-testid="purchase-remaining"
            >
              {deedRemainingLabelFa(followPreview.remainingDays)}
            </p>
          )}
          {!deedTransferDueDate && (
            <p className="text-[11px] text-muted">
              تا زمان انتخاب تاریخ سررسید، یادآوری زمان‌بندی نمی‌شود. بعداً هم می‌توانید آن را ثبت کنید.
            </p>
          )}

          <details className="pt-1 border-t border-primary/60">
            <summary className="text-[11px] font-semibold text-muted cursor-pointer">
              محاسبه اطلاع‌رسانی قانون اپراتور (اختیاری)
            </summary>
            <div className="pt-2 space-y-2.5">
              <div>
                <label className="text-xs font-semibold text-text-secondary block mb-1">
                  تاریخ انتقال سند مالکیت قبلی
                </label>
                <JalaliDatePicker
                  value={previousTransferDate}
                  onChange={setPreviousTransferDate}
                  placeholder="اگر مشخص نیست خالی بگذارید"
                  helperText={`این تاریخ با تاریخ خرید متفاوت است و فقط برای نمایش تاریخ مجاز (${MAX_DEED_TRANSFER_DAYS} روز) استفاده می‌شود.`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                <div className="flex flex-col">
                  <span className="text-muted">مبنای محاسبه</span>
                  <span className="font-semibold text-secondary font-mono" dir="ltr">
                    {eligibilityPreview.baseDate ? formatPersianDate(eligibilityPreview.baseDate, true) : '—'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted">مجاز قانونی از</span>
                  <span className="font-semibold text-secondary font-mono" dir="ltr" data-testid="purchase-next-eligible">
                    {eligibilityPreview.nextEligibleDate
                      ? formatPersianDate(eligibilityPreview.nextEligibleDate, true)
                      : '—'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted">تا مجاز شدن</span>
                  <span className="font-semibold text-secondary">{deedRemainingLabelFa(eligibilityPreview.remainingDays)}</span>
                </div>
              </div>

              {eligibilityPreview.baseSource === 'PURCHASE_FALLBACK' && previousTransferDate === '' && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold" data-testid="purchase-base-warning">
                  تاریخ انتقال قبلی ثبت نشده است؛ محاسبه موقتاً بر پایه تاریخ خرید انجام می‌شود و نیازمند بررسی است.
                </p>
              )}

              {dueCheck.warning && (
                <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 leading-relaxed" data-testid="purchase-deed-warning">
                  {dueCheck.warning}
                </p>
              )}
            </div>
          </details>
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