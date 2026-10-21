import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { SimCard, SimOperator, SimType, SimStatus, Customer, RegisteredHolder, WebsiteListingStatus, WebsiteSyncStatus } from '../../types';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { storage } from '../../services/storage';
import { useToast } from '../ui/Toast';
import { Smartphone, Check, Sparkles, DollarSign, UserCheck, Lock, Globe, Info, FileSignature } from 'lucide-react';
import { useCustomerCreationHandoff, CUSTOMER_CREATE_VALUE, customerCreateOption } from '../customers/useCustomerCreationHandoff';
import { formatToman } from '../../lib/currencyUtils';
import { cleanDigits } from '../../lib/numberUtils';
import { useTranslation } from '../../lib/i18n';
import { publishSim, withdrawSim, validateForPublication } from '../../services/wordpressSync';
import {
  validateDeedTransferDueDate,
  validateDeedTransferCompletion,
  computeDeedTransferEligibility,
  computeDeedFollowStatus,
  deedFollowStatusLabelFa,
  deedEligibilityStatusLabelFa,
  deedRemainingLabelFa,
} from '../../lib/deedTransfer';
import { isAdmin, isGod } from '../../lib/permissions';
import { JalaliDatePicker } from '../ui/JalaliDatePicker';
import { formatPersianDate } from '../../lib/dateUtils';

import { User } from '../../types';

export interface SimFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  simToEdit?: SimCard | null;
  allCustomers: Customer[];
  onSaved: (sim: SimCard) => void;
  currentUser: User;
}

export const SimFormModal: React.FC<SimFormModalProps> = ({
  isOpen,
  onClose,
  simToEdit,
  allCustomers = [],
  onSaved,
  currentUser,
}) => {
  const { success, error } = useToast();
  const { t, isRtl, formatCurrency } = useTranslation();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [operator, setOperator] = useState<SimOperator>(SimOperator.MCI);
  const [type, setType] = useState<SimType>(SimType.PERMANENT);
  const [status, setStatus] = useState<SimStatus>(SimStatus.AVAILABLE);
  const [costPrice, setCostPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [isRound, setIsRound] = useState(false);
  const [roundCategory, setRoundCategory] = useState('');
  const [ownerCustomerId, setOwnerCustomerId] = useState('');
  const customerHandoff = useCustomerCreationHandoff();
  const [registeredHolderId, setRegisteredHolderId] = useState('');
  const [registeredHolders, setRegisteredHolders] = useState<RegisteredHolder[]>([]);
  const [notes, setNotes] = useState('');

  // Website Sync
  const [websitePublishRequested, setWebsitePublishRequested] = useState(false);
  const [websiteListingStatus, setWebsiteListingStatus] = useState('NOT_PUBLISHED');

  // Purchase details
  const [purchaseSourceType, setPurchaseSourceType] = useState<'CUSTOMER' | 'INTERNAL'>('INTERNAL');
  const [purchasePrice, setPurchasePrice] = useState('');

  // Mortgage details
  const [isMortgaged, setIsMortgaged] = useState(false);
  const [mortgageeName, setMortgageeName] = useState('');
  const [mortgageAmount, setMortgageAmount] = useState('');
  const [previousTransferDate, setPreviousTransferDate] = useState('');
  const [deedTransferDueDate, setDeedTransferDueDate] = useState('');
  const [deedTransferCompleted, setDeedTransferCompleted] = useState(false);
  const [deedTransferCompletionDate, setDeedTransferCompletionDate] = useState('');
  const [deedTransferOverride, setDeedTransferOverride] = useState(false);
  const [deedTransferOverrideReason, setDeedTransferOverrideReason] = useState('');

  useEffect(() => {
    if (isOpen) {
      setRegisteredHolders(storage.getRegisteredHolders());
    }
  }, [isOpen]);

  useEffect(() => {
    if (simToEdit) {
      setPhoneNumber(simToEdit.phoneNumber || '');
      setOperator((simToEdit.operator || SimOperator.MCI) as SimOperator);
      setType((simToEdit.type || SimType.PERMANENT) as SimType);
      setStatus((simToEdit.status || SimStatus.AVAILABLE) as SimStatus);
      setCostPrice(String(simToEdit.costPrice || ''));
      setSalePrice(String(simToEdit.salePrice || ''));
      setIsRound(Boolean(simToEdit.isRound));
      setRoundCategory(simToEdit.roundCategory || '');
      setOwnerCustomerId(simToEdit.ownerCustomerId || '');
      setRegisteredHolderId(simToEdit.registeredHolderId || '');
      setNotes(simToEdit.notes || '');
      setPurchaseSourceType(simToEdit.purchaseSourceType || 'INTERNAL');
      setPurchasePrice(simToEdit.purchasePrice ? String(simToEdit.purchasePrice) : '');
      setIsMortgaged(Boolean(simToEdit.isMortgaged));
      setMortgageeName(simToEdit.mortgageeName || '');
      setMortgageAmount(simToEdit.mortgageAmount ? String(simToEdit.mortgageAmount) : '');
      setPreviousTransferDate(simToEdit.previousTransferDate || '');
      setDeedTransferDueDate(simToEdit.deedTransferDueDate || '');
      setDeedTransferCompleted(Boolean(simToEdit.deedTransferCompletedAt));
      setDeedTransferCompletionDate(simToEdit.deedTransferCompletedAt || '');
      setDeedTransferOverride(Boolean(simToEdit.deedTransferOverride));
      setDeedTransferOverrideReason(simToEdit.deedTransferOverrideReason || '');
      setWebsitePublishRequested(Boolean(simToEdit.websitePublishRequested));
      setWebsiteListingStatus(simToEdit.websiteListingStatus || 'NOT_PUBLISHED');
    } else {
      setPhoneNumber('0912');
      setOperator(SimOperator.MCI);
      setType(SimType.PERMANENT);
      setStatus(SimStatus.AVAILABLE);
      setCostPrice('');
      setSalePrice('');
      setIsRound(true);
      setRoundCategory(isRtl ? 'رند پله‌ای از اول / آینه‌ای' : 'Step / Mirror Pattern');
      setOwnerCustomerId('');
      setRegisteredHolderId('');
      setNotes('');
      setPurchaseSourceType('INTERNAL');
      setPurchasePrice('');
      setIsMortgaged(false);
      setMortgageeName('');
      setMortgageAmount('');
      setPreviousTransferDate('');
      setDeedTransferDueDate('');
      setDeedTransferCompleted(false);
      setDeedTransferCompletionDate('');
      setDeedTransferOverride(false);
      setDeedTransferOverrideReason('');
      setWebsitePublishRequested(false);
      setWebsiteListingStatus('NOT_PUBLISHED');
    }
  }, [simToEdit, isOpen, isRtl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim() || phoneNumber.length < 11) {
      error(isRtl ? 'لطفاً شماره تلفن همراه ۱۱ رقمی معتبر را وارد کنید' : 'Please enter a valid 11-digit mobile phone number');
      return;
    }
    const numCost = Number(costPrice.replace(/,/g, '')) || 0;
    const numSale = Number(salePrice.replace(/,/g, '')) || 0;
    const numPurchase = Number(purchasePrice.replace(/,/g, '')) || numCost;
    const numMortgage = Number(mortgageAmount.replace(/,/g, '')) || 0;

    const selectedCust = allCustomers.find((c) => c.id === ownerCustomerId);
    const selectedHolder = registeredHolders.find((h) => h.id === registeredHolderId);

    if (registeredHolderId && selectedHolder) {
      if (selectedHolder.isAtCapacity && simToEdit?.registeredHolderId !== registeredHolderId) {
        error(`شخص انتخاب شده (${selectedHolder.fullName}) به سقف قانونی ۱۰ سیم‌کارت رسیده است. لطفاً شخص دیگری را انتخاب فرمایید.`);
        return;
      }
    }

    // The manual due date is the operator's choice and is stored exactly as
    // typed. It is never filled in from the purchase date or the 20-day rule;
    // the server surfaces a warning instead of refusing or rewriting it.
    const completionAt = deedTransferCompleted
      ? (deedTransferCompletionDate || simToEdit?.deedTransferCompletedAt || new Date().toISOString())
      : '';

    const payload: SimCard = {
      id: simToEdit?.id || '',
      phoneNumber: phoneNumber.trim(),
      operator,
      type,
      status,
      costPrice: numCost,
      salePrice: numSale,
      isRound,
      roundCategory: isRound ? roundCategory.trim() : undefined,
      ownerCustomerId: ownerCustomerId || undefined,
      ownerCustomerName: selectedCust?.name || undefined,
      registeredHolderId: registeredHolderId || undefined,
      registeredHolderName: selectedHolder?.fullName || undefined,
      purchaseSourceType,
      purchasePrice: numPurchase,
      isMortgaged,
      mortgageeName: isMortgaged ? mortgageeName : undefined,
      mortgageAmount: isMortgaged ? numMortgage : undefined,
      previousTransferDate: previousTransferDate || undefined,
      // An empty box means "no due date": send an explicit null so the server
      // clears it. An omitted key would mean "leave it alone", which would make
      // it impossible to remove a date once set.
      deedTransferDueDate: deedTransferDueDate || null,
      deedTransferCompletedAt: completionAt || undefined,
      deedTransferOverride: deedTransferOverride || undefined,
      deedTransferOverrideReason: deedTransferOverrideReason.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: simToEdit?.createdAt || '',
      updatedAt: '',
      // Website publication metadata — publication is a deliberate user action.
      websitePublishRequested,
      websitePublicId: simToEdit?.websitePublicId,
      websiteListingStatus: websitePublishRequested
        ? (websiteListingStatus === 'NOT_PUBLISHED' ? 'PUBLISHED' : websiteListingStatus)
        : 'WITHDRAWN',
      websiteSyncStatus: simToEdit?.websiteSyncStatus || 'NOT_QUEUED',
      websiteSyncVersion: simToEdit?.websiteSyncVersion || 0,
    };

    const saved = storage.saveSimCard(payload);
    success(simToEdit ? (isRtl ? 'اطلاعات سیم‌کارت ویرایش شد' : 'SIM card details updated') : (isRtl ? 'سیم‌کارت جدید به موجودی اضافه شد' : 'New SIM card added to inventory'));
    onSaved(saved);
    onClose();

    // Website delivery runs after the local save and never blocks it. A WordPress
    // outage must not break inventory operations.
    if (websitePublishRequested) {
      const invalid = validateForPublication(saved);
      if (invalid) {
        error(isRtl ? 'این شماره شرایط انتشار در سایت را ندارد.' : 'This SIM is not eligible for publication.');
        return;
      }
      (async () => {
        const res = await publishSim(saved);
        storage.saveSimCard({
          ...saved,
          websitePublicId: saved.websitePublicId || saved.id,
          websiteLastAttemptAt: new Date().toISOString(),
          websiteSyncVersion: (saved.websiteSyncVersion || 0) + 1,
          websiteSyncStatus: res.success ? WebsiteSyncStatus.SYNCED : WebsiteSyncStatus.FAILED,
          websiteLastSyncAt: res.success ? new Date().toISOString() : saved.websiteLastSyncAt,
          websiteLastErrorCode: res.success ? undefined : res.errorCode,
        });
        res.success ? success(res.message) : error(res.message);
      })();
    } else if (simToEdit?.websitePublishRequested) {
      (async () => {
        const res = await withdrawSim(simToEdit);
        storage.saveSimCard({
          ...saved,
          websiteListingStatus: WebsiteListingStatus.WITHDRAWN,
          websiteSyncStatus: res.success ? WebsiteSyncStatus.SYNCED : WebsiteSyncStatus.FAILED,
          websiteLastErrorCode: res.success ? undefined : res.errorCode,
        });
        res.success ? success(res.message) : error(res.message);
      })();
    }
  };

  const rawSale = Number(salePrice.replace(/,/g, '')) || 0;
  const rawCost = Number(costPrice.replace(/,/g, '')) || 0;

  const canOverride = isAdmin(currentUser) || isGod(currentUser);

  const deedInputPreview = {
    previousTransferDate: previousTransferDate || undefined,
    purchaseDate: simToEdit?.purchaseDate,
    deedTransferDueDate: deedTransferDueDate || undefined,
    deedTransferCompletedAt: deedTransferCompleted
      ? (deedTransferCompletionDate || simToEdit?.deedTransferCompletedAt || new Date().toISOString())
      : '',
  };

  /** Status of the operator's hand-chosen date — this is what the UI labels. */
  const deedFollowPreview = useMemo(() => computeDeedFollowStatus(deedInputPreview), [
    deedTransferDueDate, deedTransferCompleted, deedTransferCompletionDate,
    previousTransferDate, simToEdit?.purchaseDate, simToEdit?.deedTransferCompletedAt,
  ]);

  /**
   * The calculated legal eligibility. Advisory only: it never replaces the date
   * the operator typed, it only explains how far away the legal window is.
   */
  const deedEligibilityPreview = useMemo(
    () =>
      computeDeedTransferEligibility({
        previousTransferDate: previousTransferDate || undefined,
        purchaseDate: simToEdit?.purchaseDate,
      }),
    [previousTransferDate, simToEdit?.purchaseDate]
  );

  /** Warning when the chosen date sits before a known eligibility date. */
  const deedCheckPreview = useMemo(() => validateDeedTransferDueDate(deedInputPreview), [
    deedTransferDueDate, previousTransferDate, simToEdit?.purchaseDate,
  ]);

  /** Warning when a completion is recorded before the known eligibility date. */
  const deedCompletionCheck = useMemo(() => validateDeedTransferCompletion(deedInputPreview), [
    deedTransferCompleted, deedTransferCompletionDate, previousTransferDate,
    simToEdit?.purchaseDate, simToEdit?.deedTransferCompletedAt,
  ]);

  /** Warnings are advisory: the operator's chosen date is never blocked. */
  const deedWarnings = [deedCheckPreview.warning, deedCompletionCheck.warning].filter(
    (w): w is string => Boolean(w)
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="lg"
        title={
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-indigo-400" />
            <span>{simToEdit ? t('sims.editSimModalTitle') : t('sims.newSimModalTitle')}</span>
          </div>
        }
        subtitle={t('sims.subtitle')}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <Input
            label={isRtl ? 'شماره خط (۱۱ رقم)' : 'Phone Number (11 digits)'}
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(cleanDigits(e.target.value))}
            placeholder="09121112233"
            isRequired
            className="font-mono text-center tracking-widest text-base"
          />

          <Select
            label={t('sims.operator')}
            value={operator}
            onChange={(e) => setOperator(e.target.value as SimOperator)}
            options={[
              { value: SimOperator.MCI, label: `${t('sims.mci')} (MCI)` },
              { value: SimOperator.IRANCELL, label: `${t('sims.irancell')} (MTN)` },
              { value: SimOperator.RIGHTEL, label: `${t('sims.rightel')} (Rightel)` },
              { value: SimOperator.SHATEL_MOBILE, label: t('sims.shatel') },
              { value: SimOperator.OTHER, label: isRtl ? 'سایر اپراتورها' : 'Other Operators' },
            ]}
          />

          <Select
            label={isRtl ? 'نوع سیم‌کارت' : 'SIM Type'}
            value={type}
            onChange={(e) => setType(e.target.value as SimType)}
            options={[
              { value: SimType.PERMANENT, label: t('sims.permanent') },
              { value: SimType.CREDIT, label: t('sims.creditType') },
              { value: SimType.DATA, label: isRtl ? 'دیتا / سازمانی' : 'Data / Enterprise' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <Select
            label={t('sims.status')}
            value={status}
            onChange={(e) => setStatus(e.target.value as SimStatus)}
            options={[
              { value: SimStatus.AVAILABLE, label: t('sims.statusAvailable') },
              { value: SimStatus.RESERVED, label: t('sims.statusReserved') },
              { value: SimStatus.SOLD, label: t('sims.statusSold') },
              { value: SimStatus.RENTED, label: t('sims.statusRented') },
              { value: SimStatus.SUSPENDED, label: isRtl ? 'توقیف / قطع یکطرفه' : 'Suspended' },
            ]}
          />

          <Select
            label={t('sims.ownerCustomer')}
            value={ownerCustomerId}
            onChange={(e) => {
              if (e.target.value === CUSTOMER_CREATE_VALUE) {
                customerHandoff.open((c) => setOwnerCustomerId(c.id));
              } else {
                setOwnerCustomerId(e.target.value);
              }
            }}
            options={[
              customerCreateOption(),
              { value: '', label: isRtl ? 'در مالکیت شرکت (موجود در انبار)' : 'Company Owned (In Stock)' },
              ...(allCustomers || []).map((c) => ({
                value: c.id,
                label: `${c.name} (${c.mobile})`,
              })),
            ]}
          />
        </div>

        {/* Registered Holder (سندزن / قانون سقف ۱۰ سیم‌کارت) */}
        <div className="p-3.5 rounded-2xl bg-primary/5 dark:bg-surface-subtle/90 border border-indigo-500/20 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-primary flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-indigo-500" />
              <span>شخص ثبت‌کننده / سندزن (رگولاتوری - سقف ۱۰ خط)</span>
            </label>
            <span className="text-[11px] text-muted">قاعده حداکثر ۱۰ سیم‌کارت</span>
          </div>

          <Select
            value={registeredHolderId}
            onChange={(e) => setRegisteredHolderId(e.target.value)}
            options={[
              { value: '', label: '-- بدون شخص ثبت‌کننده ثانویه (شرکتی / نامشخص) --' },
              ...(registeredHolders || []).map((h) => ({
                value: h.id,
                label: `${h.fullName} (${h.nationalId}) - ${h.activeSimCount || 0}/10 خط فعال ${h.isAtCapacity ? '[تکمیل ظرفیت]' : ''}`,
                disabled: h.isAtCapacity && simToEdit?.registeredHolderId !== h.id,
              })),
            ]}
          />
        </div>

        {/* Pricing */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1">
            <Input
              label={t('sims.costPrice')}
              type="number"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="85000000"
            />
            {rawCost > 0 && (
              <p className="text-xs text-muted text-left pr-2">
                {isRtl ? 'معادل: ' : 'Equivalent: '}{formatCurrency(rawCost)}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Input
              label={t('sims.salePrice')}
              type="number"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="120000000"
              leftIcon={<DollarSign className="w-4 h-4 text-emerald-400" />}
            />
            {rawSale > 0 && (
              <p className="text-xs text-emerald-400 font-semibold text-left pr-2">
                {isRtl ? 'معادل: ' : 'Equivalent: '}{formatCurrency(rawSale)}
              </p>
            )}
          </div>
        </div>

        {/* Round category */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-surface-subtle/80 border border-primary space-y-3">
          <Checkbox
            checked={isRound}
            onChange={(e) => setIsRound(e.target.checked)}
            label={t('sims.isRound')}
            icon={<Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400" />}
            colorScheme="amber"
            size="md"
          />

          {isRound && (
            <Input
              label={t('sims.roundCategory')}
              value={roundCategory}
              onChange={(e) => setRoundCategory(e.target.value)}
              placeholder={isRtl ? 'مثال: رند تراز، رند هزاری، جفت جفت از آخر، پله‌ای' : 'e.g. Mirror, Consecutive, Repeating digits'}
            />
          )}
        </div>

        {/* Mortgage Details */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-surface-subtle/80 border border-primary space-y-3">
          <Checkbox
            checked={isMortgaged}
            onChange={(e) => setIsMortgaged(e.target.checked)}
            label="این سیم‌کارت در رهن یا وثیقه است (رهنی / تسهیلاتی)"
            icon={<Lock className="w-4 h-4 text-purple-500" />}
            colorScheme="purple"
            size="md"
          />

          {isMortgaged && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <Input
                label="نام مرتهن / وام‌دهنده"
                value={mortgageeName}
                onChange={(e) => setMortgageeName(e.target.value)}
                placeholder="مثال: بانک سامان / سرمایه‌گذار"
              />
              <Input
                label="ارزش / مبلغ رهن (تومان)"
                value={mortgageAmount}
                onChange={(e) => setMortgageAmount(e.target.value)}
                placeholder="مثال: 40000000"
              />
            </div>
          )}
        </div>

        {/* Ownership transfer (سند).
            The due date below is the OPERATOR'S CHOICE: entered by hand, editable
            at any time, never calculated or reset from the purchase date or the
            waiting-period rule. The calculated legal eligibility is shown
            separately and only ever as advisory context. */}
        {(true) && (
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-surface-subtle/80 border border-primary space-y-3" data-testid="deed-transfer-section">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
              <FileSignature className="w-4 h-4 text-emerald-500" />
              <span>انتقال سند مالکیت</span>
            </span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${
                deedFollowPreview.status === 'COMPLETED'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : deedFollowPreview.status === 'OVERDUE'
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                  : deedFollowPreview.status === 'DUE_TODAY'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : 'bg-slate-500/10 text-slate-500 border-slate-400/30'
              }`}
              data-testid="deed-follow-status"
            >
              {deedFollowStatusLabelFa(deedFollowPreview.status)}
            </span>
          </div>

          {/* The manual due date — the primary control in this section. */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-secondary">
              تاریخ سررسید انتقال سند
            </label>
            <JalaliDatePicker
              value={deedTransferDueDate}
              onChange={setDeedTransferDueDate}
              placeholder="انتخاب تاریخ پیگیری انتقال سند"
              helperText="تاریخ را به‌صورت دستی و متناسب با برنامه‌ریزی عملیاتی خود انتخاب کنید؛ این تاریخ از تاریخ خرید یا قانون انتظار خودکار محاسبه نمی‌شود."
            />
            {deedFollowPreview.status !== 'NOT_SET' && deedFollowPreview.status !== 'COMPLETED' && (
              <p
                className={`text-[11px] font-semibold ${
                  deedFollowPreview.status === 'OVERDUE'
                    ? 'text-rose-600 dark:text-rose-400'
                    : deedFollowPreview.status === 'DUE_TODAY'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-muted'
                }`}
                data-testid="deed-follow-remaining"
              >
                {deedFollowPreview.remainingDays !== null
                  ? `${deedFollowStatusLabelFa(deedFollowPreview.status)} — ${deedRemainingLabelFa(deedFollowPreview.remainingDays)}`
                  : deedFollowStatusLabelFa(deedFollowPreview.status)}
              </p>
            )}
            {!deedTransferDueDate && (
              <p className="text-[11px] text-muted">
                تاریخی ثبت نشده است؛ تا زمان انتخاب آن یادآوری زمان‌بندی نمی‌شود.
              </p>
            )}
          </div>

          {/* Calculated legal eligibility — advisory, and visually secondary so
              it can never be mistaken for the date the operator chose. */}
          {(previousTransferDate || simToEdit?.purchaseDate) && (
            <div
              className="p-2.5 rounded-xl bg-surface border border-primary/70 space-y-1.5 text-[11px]"
              data-testid="deed-eligibility-block"
            >
              <span className="flex items-center gap-1.5 font-bold text-muted">
                <Info className="w-3 h-3" />
                <span>محاسبه اطلاع‌رسانی قانون اپراتور</span>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="flex flex-col">
                  <span className="text-muted">تاریخ انتقال قبلی (مبنا)</span>
                  <span className="font-semibold text-secondary font-mono" dir="ltr">
                    {deedEligibilityPreview.baseDate ? formatPersianDate(deedEligibilityPreview.baseDate, true) : '—'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted">تاریخ مجاز انتقال بعدی</span>
                  <span className="font-semibold text-secondary font-mono" dir="ltr" data-testid="deed-next-eligible">
                    {deedEligibilityPreview.nextEligibleDate
                      ? formatPersianDate(deedEligibilityPreview.nextEligibleDate, true)
                      : '—'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted">وضعیت مجاز</span>
                  <span
                    className={
                      deedEligibilityPreview.status === 'WAITING'
                        ? 'font-semibold text-amber-600 dark:text-amber-400'
                        : deedEligibilityPreview.status === 'UNKNOWN'
                        ? 'text-muted'
                        : 'font-semibold text-emerald-600 dark:text-emerald-400'
                    }
                  >
                    {deedEligibilityStatusLabelFa(deedEligibilityPreview.status)}
                    {deedEligibilityPreview.remainingDays !== null &&
                      ` — ${deedRemainingLabelFa(deedEligibilityPreview.remainingDays)}`}
                  </span>
                </div>
              </div>
              {deedEligibilityPreview.needsVerification && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold" data-testid="deed-base-warning">
                  {deedEligibilityPreview.baseSource === 'PURCHASE_FALLBACK'
                    ? 'تاریخ انتقال سند قبلی ثبت نشده است؛ محاسبه موقتاً بر پایه تاریخ خرید انجام شده و نیازمند بررسی است.'
                    : 'برای این پرونده مبنای محاسبه ثبت نشده است؛ وضعیت مجاز قابل محاسبه نیست.'}
                </p>
              )}
            </div>
          )}

          {/* Advisory only — the chosen date is never blocked or rewritten. */}
          {deedWarnings.map((warning) => (
            <p
              key={warning}
              className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 leading-relaxed"
              data-testid="deed-warning"
            >
              {warning}
            </p>
          ))}

          <Checkbox
            label="انتقال سند انجام شده است"
            checked={deedTransferCompleted}
            onChange={(e) => setDeedTransferCompleted(Boolean((e.target as HTMLInputElement).checked))}
            colorScheme="emerald"
            size="md"
            icon={<FileSignature className="w-4 h-4 text-emerald-500" />}
          />

          {deedTransferCompleted && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-secondary">تاریخ واقعی تکمیل انتقال سند</label>
              <JalaliDatePicker
                value={deedTransferCompletionDate}
                onChange={setDeedTransferCompletionDate}
                placeholder="تاریخ تکمیل انتقال"
              />
              <p className="text-[10px] text-muted">
                پس از ثبت تکمیل، یادآوری‌های باقی‌مانده این سیم‌کارت لغو می‌شوند.
              </p>
            </div>
          )}

          {(previousTransferDate || simToEdit?.purchaseDate) && (
            <div className="space-y-1.5 pt-1 border-t border-primary">
              <label className="block text-xs font-semibold text-secondary">
                تاریخ انتقال سند مالکیت قبلی (برای محاسبه قانون اپراتور)
              </label>
              <JalaliDatePicker
                value={previousTransferDate}
                onChange={setPreviousTransferDate}
                placeholder="اگر مشخص نیست خالی بگذارید"
                helperText="این تاریخ با تاریخ خرید متفاوت است و صرفاً برای نمایش مهلت قانونی استفاده می‌شود."
              />
            </div>
          )}

          {deedTransferOverride && simToEdit?.deedTransferOverrideByUserId && (
            <p className="text-[10px] text-muted">
              استثنای ثبت‌شده توسط: {simToEdit.deedTransferOverrideByUserId}
              {simToEdit.deedTransferOverrideAt ? ` — ${formatPersianDate(simToEdit.deedTransferOverrideAt, true)}` : ''}
            </p>
          )}
        </div>
        )}

        <Textarea
          label={t('sims.notes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder={isRtl ? 'سند تک‌برگ، کارکرد صفر، بدون زنگ‌خور و...' : 'Notes, condition, history...'}
        />

        {/* انتشار در سایت اول سیم / AVALSIM website publication */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
            <Globe className="w-4 h-4 text-sky-500" />
            <span>{isRtl ? 'انتشار در سایت اول سیم' : 'Publish on AVALSIM Website'}</span>
          </div>

          <Checkbox
            label={isRtl ? 'انتشار این شماره در کاتالوگ عمومی سایت' : 'Publish this number to the public catalogue'}
            checked={websitePublishRequested}
            onChange={(e) => setWebsitePublishRequested(Boolean((e.target as HTMLInputElement).checked))}
          />

          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {isRtl
              ? 'با فعال‌سازی، فیلدهای عمومی تاییدشده پس از همگام‌سازی موفق در وب‌سایت نمایش داده می‌شوند. اطلاعات محرمانه، قیمت خرید و مشخصات مشتری هرگز ارسال نمی‌شود.'
              : 'When enabled, approved public fields appear on the website after a successful sync. Private data, purchase cost and customer details are never sent.'}
          </p>

          {websitePublishRequested && (Number(salePrice.replace(/,/g, '')) || 0) <= 0 && (
            <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
              {isRtl ? 'برای انتشار، تعیین قیمت فروش عمومی الزامی است.' : 'A public sale price is required before publishing.'}
            </p>
          )}

          {(simToEdit?.websiteListingStatus || websiteListingStatus) !== 'NOT_PUBLISHED' && (
            <div className="flex flex-wrap gap-3 pt-1 text-[10px] text-slate-500 dark:text-slate-400">
              <span>
                {isRtl ? 'وضعیت انتشار: ' : 'Listing: '}
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {simToEdit?.websiteListingStatus || websiteListingStatus}
                </span>
              </span>
              <span>
                {isRtl ? 'وضعیت همگام‌سازی: ' : 'Sync: '}
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {simToEdit?.websiteSyncStatus || 'NOT_QUEUED'}
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-primary">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" size="sm" type="submit" leftIcon={<Check className="w-4 h-4" />}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>

      {customerHandoff.modal}
    </>
  );
};

