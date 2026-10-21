import React, { useState, useEffect } from 'react';
import { SimCard, Customer, Contract, User, SimPaymentMethod } from '../../types';
import { storage } from '../../services/storage';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { RTLNumber } from '../ui/RTLNumber';
import {
  Bookmark, CheckCircle2, XCircle, ArrowRightLeft, DollarSign,
  Calendar, UserCheck, ShieldCheck, Tag, ShoppingCart, Lock, Handshake
} from 'lucide-react';
import { useCustomerCreationHandoff, CUSTOMER_CREATE_VALUE, CUSTOMER_CREATE_LABEL } from '../customers/useCustomerCreationHandoff';

export type LifecycleMode = 'RESERVE' | 'CANCEL_RESERVE' | 'SELL' | 'MORTGAGE' | 'CONSIGNMENT';

export interface SimLifecycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  sim: SimCard | null;
  mode: LifecycleMode;
  customers: Customer[];
  contracts: Contract[];
  currentUser: User;
  allUsers?: User[];
  onSuccess: (updatedSim: SimCard) => void;
}

export const SimLifecycleModal: React.FC<SimLifecycleModalProps> = ({
  isOpen,
  onClose,
  sim,
  mode,
  customers = [],
  contracts = [],
  currentUser,
  allUsers = [],
  onSuccess,
}) => {
  const { success, error } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Reservation State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [reservationDeadline, setReservationDeadline] = useState('');
  const [reservationNotes, setReservationNotes] = useState('');

  // Cancellation State
  const [cancellationReason, setCancellationReason] = useState('');
  const [refundRequired, setRefundRequired] = useState(true);

  // Sale State
  const [saleCustomerId, setSaleCustomerId] = useState('');
  const [saleContractId, setSaleContractId] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('OFFICE_PICKUP');
  const [buyerMobile, setBuyerMobile] = useState('');
  const [buyerNationalId, setBuyerNationalId] = useState('');
  const [saleCashMethod, setSaleCashMethod] = useState<SimPaymentMethod>(SimPaymentMethod.CASH);
  const [saleCashAmount, setSaleCashAmount] = useState('');

  // Mortgage State
  const [isMortgaged, setIsMortgaged] = useState(true);
  const [mortgageeName, setMortgageeName] = useState('');
  const [mortgageAmount, setMortgageAmount] = useState('');
  const [mortgageStartDate, setMortgageStartDate] = useState('');
  const [mortgageEndDate, setMortgageEndDate] = useState('');
  const [mortgageNotes, setMortgageNotes] = useState('');

  // Consignment State (امانی)
  const [consOwnerCustomerId, setConsOwnerCustomerId] = useState('');
  const [consRequestedPrice, setConsRequestedPrice] = useState('');
  const [consCommissionType, setConsCommissionType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [consCommissionValue, setConsCommissionValue] = useState('');
  const [consAgreedTerms, setConsAgreedTerms] = useState('');
  const [consResponsibleUserId, setConsResponsibleUserId] = useState('');
  const [consExpiryAt, setConsExpiryAt] = useState('');
  const [consNotes, setConsNotes] = useState('');

  // "Create customer" handoff — the reservation/sale/consignment form stays
  // mounted underneath, so its draft survives the round-trip.
  const customerHandoff = useCustomerCreationHandoff();

  /** Apply a freshly created customer to whichever selector opened the modal. */
  const applyNewCustomer = (slot: 'RESERVE' | 'SELL' | 'CONSIGNMENT') => (cust: Customer) => {
    if (slot === 'RESERVE') {
      setSelectedCustomerId(cust.id);
    } else if (slot === 'SELL') {
      setSaleCustomerId(cust.id);
      setBuyerMobile(cust.phone || '');
      setBuyerNationalId(cust.nationalId || '');
    } else {
      setConsOwnerCustomerId(cust.id);
    }
  };

  useEffect(() => {
    if (sim && isOpen) {
      try {
        if (mode === 'RESERVE') {
          setSelectedCustomerId(sim.reservationCustomerId || sim.customerId || '');
          setDepositAmount(sim.depositAmount ? String(sim.depositAmount) : '');
          setReservationDeadline(sim.reservationExpireAt || '');
          setReservationNotes(sim.reservationNotes || '');
        } else if (mode === 'SELL') {
          setSaleCustomerId(sim.customerId || sim.reservationCustomerId || '');
          setSalePrice(sim.salePrice ? String(sim.salePrice) : '');
          setDeliveryMethod('OFFICE_PICKUP');
          setSaleContractId('');
          setBuyerMobile('');
          setBuyerNationalId('');
        } else if (mode === 'MORTGAGE') {
          setIsMortgaged(Boolean(sim.isMortgaged ?? true));
          setMortgageeName(sim.mortgageeName || sim.ownerCustomerName || '');
          setMortgageAmount(sim.mortgageAmount ? String(sim.mortgageAmount) : '');
          setMortgageStartDate(sim.mortgageStartDate || new Date().toISOString().slice(0, 10));
          setMortgageEndDate(sim.mortgageEndDate || '');
          setMortgageNotes(sim.mortgageNotes || '');
        } else if (mode === 'CONSIGNMENT') {
          setConsOwnerCustomerId(sim.ownerCustomerId || '');
          setConsRequestedPrice(sim.salePrice ? String(sim.salePrice) : '');
          setConsCommissionType('PERCENTAGE');
          setConsCommissionValue('');
          setConsAgreedTerms('');
          setConsResponsibleUserId(currentUser.id);
          setConsExpiryAt('');
          setConsNotes('');
        }
      } catch (err) {
        console.error('Error initializing lifecycle modal state:', err);
      }
    }
  }, [sim, mode, isOpen]);

  if (!isOpen || !sim) return null;

  const handleReserveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      error('لطفاً مشتری رزروکننده را انتخاب فرمایید.');
      return;
    }
    const customer = customers.find((c) => c.id === selectedCustomerId);
    const deposit = Number(depositAmount.replace(/,/g, '')) || 0;

    setIsLoading(true);
    try {
      const updated = await storage.reserveSimCard(sim.id, {
        customerId: selectedCustomerId,
        customerName: customer?.name || 'مشتری نامشخص',
        depositAmount: deposit,
        deadline: reservationDeadline || undefined,
        notes: reservationNotes || undefined,
        userId: currentUser.id,
        userName: currentUser.name,
      });
      success(`سیم‌کارت ${sim.phoneNumber} با موفقیت رزرو شد.`);
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      error(err.message || 'خطا در ثبت رزرو سیم‌کارت');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelReserveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const updated = await storage.cancelSimReservation(sim.id, {
        reason: cancellationReason || 'انصراف مشتری',
        refundDeposit: refundRequired,
      });
      success(`رزرو سیم‌کارت ${sim.phoneNumber} لغو گردید و به وضعیت موجود بازگشت.`);
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      error(err.message || 'خطا در لغو رزرو');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSellSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleCustomerId) {
      error('لطفاً مشتری خریدار را انتخاب کنید.');
      return;
    }
    const customer = (customers || []).find((c) => c.id === saleCustomerId);
    const price = Number(salePrice.replace(/,/g, '')) || sim.salePrice || 0;
    const contract = (contracts || []).find((ct) => ct.id === saleContractId);

    setIsLoading(true);
    try {
      const updated = await storage.sellSimCard(sim.id, {
        customerId: saleCustomerId,
        customerName: customer?.name || 'مشتری خریدار',
        contractId: saleContractId || `cnt-auto-${Date.now()}`,
        contractNumber: contract?.contractNumber || `CNT-${Date.now().toString().slice(-5)}`,
        salePrice: price,
        buyerMobile: buyerMobile || customer?.phone,
        buyerNationalId: buyerNationalId || customer?.nationalId,
        deliveryMethod,
        cashPaymentMethod: saleCashMethod,
        cashAmountPaid: Number(saleCashAmount.replace(/,/g, '')) || 0,
      });
      success(`فروش سیم‌کارت ${sim.phoneNumber} ثبت و وضعیت به فروخته شده تغییر یافت.`);
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      error(err.message || 'خطا در ثبت فروش سیم‌کارت');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMortgageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(mortgageAmount.replace(/,/g, '')) || 0;

    setIsLoading(true);
    try {
      const updated = await storage.mortgageSimCard(sim.id, {
        isMortgaged,
        mortgageeName,
        mortgageAmount: amount,
        mortgageStartDate,
        mortgageEndDate,
        notes: mortgageNotes,
      });
      success(isMortgaged ? `وضعیت رهن سیم‌کارت ${sim.phoneNumber} ثبت شد.` : `رهن سیم‌کارت فک و آزاد گردید.`);
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      error(err.message || 'خطا در ثبت رهن');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConsignmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consOwnerCustomerId) {
      error('لطفاً مالک / مشتری صاحب سیم‌کارت را انتخاب فرمایید.');
      return;
    }
    if (!consRequestedPrice) {
      error('لطفاً قیمت پیشنهادی مالک را وارد کنید.');
      return;
    }
    if (!consResponsibleUserId) {
      error('لطفاً مسئول پیگیری را انتخاب کنید.');
      return;
    }
    const ownerCustomer = (customers || []).find((c) => c.id === consOwnerCustomerId);
    const responsibleUser = (allUsers && allUsers.length > 0 ? allUsers : [currentUser]).find((u) => u.id === consResponsibleUserId) || currentUser;
    const requestedPrice = Number(consRequestedPrice.replace(/,/g, '')) || 0;
    const commissionValue = Number(consCommissionValue.replace(/,/g, '')) || 0;

    setIsLoading(true);
    try {
      const consignment = storage.saveConsignment({
        simId: sim.id,
        simPhoneNumber: sim.phoneNumber,
        ownerCustomerId: consOwnerCustomerId,
        ownerCustomerName: ownerCustomer?.name || 'مشتری نامشخص',
        receivedAt: new Date().toISOString(),
        requestedPrice,
        commissionType: consCommissionType,
        commissionValue,
        agreedTerms: consAgreedTerms.trim(),
        responsibleUserId: consResponsibleUserId,
        responsibleUserName: responsibleUser.name,
        expiryAt: consExpiryAt || undefined,
        status: 'CONSIGNMENT',
        notes: consNotes.trim() || undefined,
      });

      // Update SIM to consignment status
      const updatedSim = await storage.saveSimCard({
        ...sim,
        status: 'CONSIGNMENT' as any,
        ownerCustomerId: consOwnerCustomerId,
        ownerCustomerName: ownerCustomer?.name,
        consignmentId: consignment.id,
        isConsigned: true,
        consignmentStatus: 'CONSIGNMENT',
        updatedAt: new Date().toISOString(),
      });

      storage.logAudit({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CREATE_CONSIGNMENT',
        module: 'CONSIGNMENTS',
        entityType: 'CONSIGNMENT',
        entityName: `سیم‌کارت ${sim.phoneNumber}`,
        targetId: consignment.id,
        details: `ثبت امانی سیم‌کارت ${sim.phoneNumber} از ${ownerCustomer?.name || ''} با قیمت پیشنهادی ${requestedPrice}`,
      });

      success(`سیم‌کارت ${sim.phoneNumber} به صورت امانی از ${ownerCustomer?.name || ''} ثبت شد.`);
      onSuccess(updatedSim);
      onClose();
    } catch (err: any) {
      error(err.message || 'خطا در ثبت امانی سیم‌کارت');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        mode === 'RESERVE'
          ? `رزرو و دریافت بیعانه: ${sim.phoneNumber}`
          : mode === 'CANCEL_RESERVE'
          ? `لغو رزرو سیم‌کارت: ${sim.phoneNumber}`
          : mode === 'SELL'
          ? `ثبت فروش قطعی سیم‌کارت: ${sim.phoneNumber}`
          : mode === 'CONSIGNMENT'
          ? `ثبت امانی سیم‌کارت: ${sim.phoneNumber}`
          : `مدیریت رهن و تسهیلات: ${sim.phoneNumber}`
      }
      size="lg"
    >
      <div className="space-y-4">
        {/* SIM Info Header */}
        <div className="p-3 rounded-2xl bg-surface-subtle dark:bg-surface-subtle border border-primary flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-extrabold text-primary">
              {sim.phoneNumber}
            </span>
            <Badge variant="default" size="sm">{sim.operator}</Badge>
          </div>
          <div className="text-xs text-muted">
            قیمت پایه: <span className="font-bold text-secondary dark:text-slate-200"><RTLNumber value={sim.salePrice || 0} type="price" /></span>
          </div>
        </div>

        {/* RESERVE MODE */}
        {mode === 'RESERVE' && (
          <form onSubmit={handleReserveSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="مشتری رزروکننده"
                value={selectedCustomerId}
                onChange={(e) => {
                  if (e.target.value === CUSTOMER_CREATE_VALUE) {
                    customerHandoff.open(applyNewCustomer('RESERVE'));
                  } else {
                    setSelectedCustomerId(e.target.value);
                  }
                }}
                isRequired
              >
                <option value={CUSTOMER_CREATE_VALUE}>{CUSTOMER_CREATE_LABEL}</option>
                <option value="">-- انتخاب مشتری --</option>
                {(customers || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.phone || ''})</option>
                ))}
              </Select>

              <Input
                label="مبلغ بیعانه دریافتی (تومان)"
                placeholder="مثال: ۵,۰۰۰,۰۰۰"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                isRequired
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="مهلت رزرو تا تاریخ"
                type="date"
                value={reservationDeadline}
                onChange={(e) => setReservationDeadline(e.target.value)}
              />
              <Input
                label="ثبت‌کننده رزرو"
                value={currentUser.name}
                disabled
              />
            </div>

            <Textarea
              label="توضیحات و شرایط توافق بیعانه"
              placeholder="مثال: در صورت عدم تسویه تا ۴۸ ساعت، بیعانه مسترد نمی‌گردد..."
              value={reservationNotes}
              onChange={(e) => setReservationNotes(e.target.value)}
              rows={2}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" type="button" onClick={onClose}>انصراف</Button>
              <Button variant="primary" size="sm" type="submit" isLoading={isLoading} leftIcon={<Bookmark className="w-4 h-4" />}>
                تایید و ثبت رزرو
              </Button>
            </div>
          </form>
        )}

        {/* CANCEL RESERVE MODE */}
        {mode === 'CANCEL_RESERVE' && (
          <form onSubmit={handleCancelReserveSubmit} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-warning dark:text-amber-300 text-xs leading-relaxed">
              این سیم‌کارت در حال حاضر به نام «{sim.reservationCustomerName || 'مشتری'}» رزرو است. با لغو رزرو، وضعیت خط به <strong>موجود (AVAILABLE)</strong> تغییر خواهد یافت.
            </div>

            <Textarea
              label="دلیل لغو رزرو (الزامی)"
              placeholder="مثال: انصراف مشتری، اتمام مهلت ۴۸ ساعته، عدم توافق قیمت..."
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              rows={2}
              isRequired
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" type="button" onClick={onClose}>انصراف</Button>
              <Button variant="danger" size="sm" type="submit" isLoading={isLoading} leftIcon={<XCircle className="w-4 h-4" />}>
                تایید لغو رزرو
              </Button>
            </div>
          </form>
        )}

        {/* SELL MODE */}
        {mode === 'SELL' && (
          <form onSubmit={handleSellSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="مشتری خریدار"
                value={saleCustomerId}
                onChange={(e) => {
                  if (e.target.value === CUSTOMER_CREATE_VALUE) {
                    customerHandoff.open(applyNewCustomer('SELL'));
                    return;
                  }
                  setSaleCustomerId(e.target.value);
                  const cust = (customers || []).find((c) => c.id === e.target.value);
                  if (cust) {
                    setBuyerMobile(cust.phone || '');
                    setBuyerNationalId(cust.nationalId || '');
                  }
                }}
                isRequired
              >
                <option value={CUSTOMER_CREATE_VALUE}>{CUSTOMER_CREATE_LABEL}</option>
                <option value="">-- انتخاب خریدار --</option>
                {(customers || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.phone || ''})</option>
                ))}
              </Select>

              <Input
                label="قیمت فروش نهایی (تومان)"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                isRequired
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="قرارداد مرتبط (اختیاری)"
                value={saleContractId}
                onChange={(e) => setSaleContractId(e.target.value)}
              >
                <option value="">-- ایجاد قرارداد خودکار یا بدون قرارداد --</option>
                {(contracts || []).map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.contractNumber || ''} - {ct.title || ''}
                  </option>
                ))}
              </Select>

              <Select
                label="شیوه تحویل سیم‌کارت"
                value={deliveryMethod}
                onChange={(e) => setDeliveryMethod(e.target.value)}
              >
                <option value="OFFICE_PICKUP">تحویل حضوری در دفتر</option>
                <option value="COURIER">ارسال با پیک / پست پیشتاز</option>
                <option value="NAME_TRANSFER">انتقال سند در دفتر پیشخوان</option>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border-subtle">
              <Select
                label="روش پرداخت هنگام فروش (اختیاری)"
                value={saleCashMethod}
                onChange={(e) => setSaleCashMethod(e.target.value as SimPaymentMethod)}
              >
                <option value={SimPaymentMethod.CASH}>نقدی</option>
                <option value={SimPaymentMethod.CARD_READER}>کارت‌خوان / پوز</option>
                <option value={SimPaymentMethod.BANK_TRANSFER}>انتقال بانکی</option>
                <option value={SimPaymentMethod.CHECK}>چک</option>
                <option value={SimPaymentMethod.ONLINE_GATEWAY}>درگاه آنلاین</option>
              </Select>
              <Input
                label="مبلغ دریافت‌شده هنگام فروش (اختیاری)"
                value={saleCashAmount}
                onChange={(e) => setSaleCashAmount(e.target.value)}
                placeholder="۰ (در صورت تسویه کامل وارد شود)"
                type="text"
                inputMode="numeric"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" type="button" onClick={onClose}>انصراف</Button>
              <Button variant="primary" size="sm" type="submit" isLoading={isLoading} leftIcon={<ShoppingCart className="w-4 h-4" />}>
                ثبت فروش قطعی
              </Button>
            </div>
          </form>
        )}

        {/* MORTGAGE MODE */}
        {mode === 'MORTGAGE' && (
          <form onSubmit={handleMortgageSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="نام شخص یا نهاد مرتهن (وثیقه‌گذار / وام‌دهنده)"
                placeholder="مثال: بانک ملی / شخص سرمایه‌گذار"
                value={mortgageeName}
                onChange={(e) => setMortgageeName(e.target.value)}
                isRequired
              />

              <Input
                label="مبلغ رهن / ارزش وثیقه (تومان)"
                placeholder="مثال: ۵۰,۰۰۰,۰۰۰"
                value={mortgageAmount}
                onChange={(e) => setMortgageAmount(e.target.value)}
                isRequired
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="تاریخ شروع رهن"
                type="date"
                value={mortgageStartDate}
                onChange={(e) => setMortgageStartDate(e.target.value)}
              />
              <Input
                label="تاریخ سررسید / پایان رهن"
                type="date"
                value={mortgageEndDate}
                onChange={(e) => setMortgageEndDate(e.target.value)}
              />
            </div>

            <Textarea
              label="توضیحات و شرایط فک رهن"
              placeholder="توضیحات توافق بازپرداخت و انتقال سند پس از تسویه..."
              value={mortgageNotes}
              onChange={(e) => setMortgageNotes(e.target.value)}
              rows={2}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" type="button" onClick={onClose}>انصراف</Button>
              <Button variant="primary" size="sm" type="submit" isLoading={isLoading} leftIcon={<Lock className="w-4 h-4" />}>
                ذخیره وضعیت رهن
              </Button>
            </div>
          </form>
        )}

        {/* CONSIGNMENT MODE (امانی) */}
        {mode === 'CONSIGNMENT' && (
          <form onSubmit={handleConsignmentSubmit} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-primary/10 border border-primary text-indigo-800 dark:text-indigo-300 text-xs leading-relaxed">
              سیم‌کارت به صورت «امانی» از مالک دریافت می‌شود. مالک باید از مشتری‌های ثبت‌شده در سیستم انتخاب شود و پس از فروش، مبلغ قابل تسویه بر اساس قیمت واقعی و کمیسیون توافق‌شده محاسبه می‌گردد.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="مالک / مشتری صاحب سیم‌کارت"
                value={consOwnerCustomerId}
                onChange={(e) => {
                  if (e.target.value === CUSTOMER_CREATE_VALUE) {
                    customerHandoff.open(applyNewCustomer('CONSIGNMENT'));
                  } else {
                    setConsOwnerCustomerId(e.target.value);
                  }
                }}
                isRequired
              >
                <option value={CUSTOMER_CREATE_VALUE}>{CUSTOMER_CREATE_LABEL}</option>
                <option value="">-- انتخاب مالک از مشتریان سیستم --</option>
                {(customers || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.phone || ''})</option>
                ))}
              </Select>

              <Input
                label="قیمت پیشنهادی مالک (تومان)"
                value={consRequestedPrice}
                onChange={(e) => setConsRequestedPrice(e.target.value)}
                isRequired
                placeholder="مثال: ۸۵۰,۰۰۰,۰۰۰"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1.5">
                  نوع کمیسیون <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConsCommissionType('PERCENTAGE')}
                    className={`flex-1 text-xs px-3 py-2 rounded-xl border transition-all ${
                      consCommissionType === 'PERCENTAGE'
                        ? 'bg-primary text-white border-indigo-500 font-semibold'
                        : 'bg-surface border-primary text-secondary'
                    }`}
                  >
                    درصدی از فروش
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsCommissionType('FIXED')}
                    className={`flex-1 text-xs px-3 py-2 rounded-xl border transition-all ${
                      consCommissionType === 'FIXED'
                        ? 'bg-primary text-white border-indigo-500 font-semibold'
                        : 'bg-surface border-primary text-secondary'
                    }`}
                  >
                    مبلغ ثابت
                  </button>
                </div>
              </div>

              <Input
                label={consCommissionType === 'PERCENTAGE' ? 'درصد کمیسیون (مثال: ۵)' : 'مبلغ کمیسیون (تومان)'}
                value={consCommissionValue}
                onChange={(e) => setConsCommissionValue(e.target.value)}
                isRequired
                placeholder={consCommissionType === 'PERCENTAGE' ? '۵' : 'مثال: ۱۰,۰۰۰,۰۰۰'}
              />
            </div>

            <Textarea
              label="شرایط توافق"
              placeholder="مثال: سیم‌کارت تا ۳ ماه در اختیار فروشگاه؛ فروش فقط نقدی؛ عدم مسئولیت در صورت مفقودی..."
              value={consAgreedTerms}
              onChange={(e) => setConsAgreedTerms(e.target.value)}
              rows={2}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="مسئول پیگیری"
                value={consResponsibleUserId}
                onChange={(e) => setConsResponsibleUserId(e.target.value)}
                isRequired
              >
                <option value="">-- انتخاب مسئول پیگیری --</option>
                {(allUsers && allUsers.length > 0 ? allUsers : [currentUser]).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>

              <Input
                label="تاریخ پایان امانت (اختیاری)"
                type="date"
                value={consExpiryAt}
                onChange={(e) => setConsExpiryAt(e.target.value)}
              />
            </div>

            <Textarea
              label="توضیحات و اسناد مرتبط"
              placeholder="توضیحات تکمیلی..."
              value={consNotes}
              onChange={(e) => setConsNotes(e.target.value)}
              rows={2}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" type="button" onClick={onClose}>انصراف</Button>
              <Button variant="primary" size="sm" type="submit" isLoading={isLoading} leftIcon={<Handshake className="w-4 h-4" />}>
                ثبت امانی سیم‌کارت
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
      {customerHandoff.modal}
    </>
  );
};
