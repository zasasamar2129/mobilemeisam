import React, { useState, useMemo } from 'react';
import { SimCard, SimOperator, SimType, SimStatus, Customer, Contract, User, WebsiteListingStatus, WebsiteSyncStatus } from '../../types';
import {
  Smartphone, Search, Plus, Sparkles, AlertTriangle,
  CheckCircle2, Edit3, Trash2, Tag, Layers, ArrowLeftRight,
  Users, Bookmark, ShoppingCart, Lock, XCircle, UserCheck,
  Eye, ArrowUpDown, Handshake, Wallet, Globe
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Checkbox } from '../ui/Checkbox';
import { ExportExcelButton } from '../ui/ExportExcelButton';
import { RTLNumber } from '../ui/RTLNumber';
import { exportSimsToExcel } from '../../lib/exportToExcel';
import { formatToman } from '../../lib/currencyUtils';
import { storage } from '../../services/storage';
import { useToast } from '../ui/Toast';
import { useTranslation } from '../../lib/i18n';
import { formatPersianDate, isOverdue } from '../../lib/dateUtils';
import {
  computeDeedTransferEligibility,
  computeDeedFollowStatus,
  deedFollowStatusLabelFa,
  deedRemainingLabelFa,
} from '../../lib/deedTransfer';
import { publishSim } from '../../services/wordpressSync';
import { RegisteredHoldersModal } from './RegisteredHoldersModal';
import { SimLifecycleModal, LifecycleMode } from './SimLifecycleModal';
import { HorizontalScrollContainer } from '../ui/HorizontalScrollContainer';
import { ListViewControls, usePersistentViewMode } from '../ui/ListViewControls';
import { SimPublishModal } from './SimPublishModal';
import { SimFinancialDetail } from './SimFinancialDetail';

export interface SimListProps {
  sims: SimCard[];
  customers: Customer[];
  contracts?: Contract[];
  currentUser?: User;
  allUsers?: User[];
  onAddNewSim: () => void;
  onEditSim: (sim: SimCard) => void;
  onRefreshSims: () => void;
  onSelectCustomer: (customerId: string) => void;
}

export const SimList: React.FC<SimListProps> = ({
  sims = [],
  customers = [],
  contracts = [],
  currentUser = { id: 'usr-admin', name: 'مدیر سیستم', role: 'SUPER_ADMIN' as any } as User,
  allUsers = [],
  onAddNewSim,
  onEditSim,
  onRefreshSims,
  onSelectCustomer,
}) => {
  const { success } = useToast();
  const { t, isRtl, formatNumber } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [operatorFilter, setOperatorFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [roundOnly, setRoundOnly] = useState(false);
  const [deedFilter, setDeedFilter] = useState<string>('ALL');
  const [selectedHolderFilter, setSelectedHolderFilter] = useState<{ id: string; name: string } | null>(null);
  const [sortBy, setSortBy] = useState<'price_desc' | 'price_asc' | 'phone'>('price_desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkPublishing, setIsBulkPublishing] = useState(false);

  // View Mode & Pagination
  const [viewMode, setViewMode] = usePersistentViewMode('sims', 'list');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modals
  const [isHoldersModalOpen, setIsHoldersModalOpen] = useState(false);
  const [publishSimState, setPublishSimState] = useState<SimCard | null>(null);
  const [financialSim, setFinancialSim] = useState<SimCard | null>(null);
  const [lifecycleModal, setLifecycleModal] = useState<{
    isOpen: boolean;
    sim: SimCard | null;
    mode: LifecycleMode;
  }>({
    isOpen: false,
    sim: null,
    mode: 'RESERVE',
  });

  const filteredSims = useMemo(() => {
    return (sims || [])
      .filter((s) => {
        if (operatorFilter !== 'ALL' && s.operator !== operatorFilter) return false;
        if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
        // Transfer follow-up filter, driven by the operator's hand-chosen due date.
        if (deedFilter !== 'ALL' && computeDeedFollowStatus(s).status !== deedFilter) return false;
        if (roundOnly && !s.isRound) return false;
        if (selectedHolderFilter && s.registeredHolderId !== selectedHolderFilter.id) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        return (
          s.phoneNumber.includes(q) ||
          (s.roundCategory && s.roundCategory.toLowerCase().includes(q)) ||
          (s.ownerCustomerName && s.ownerCustomerName.toLowerCase().includes(q)) ||
          (s.registeredHolderName && s.registeredHolderName.toLowerCase().includes(q)) ||
          (s.reservationCustomerName && s.reservationCustomerName.toLowerCase().includes(q)) ||
          (s.notes && s.notes.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sortBy === 'price_asc') return (a.salePrice || 0) - (b.salePrice || 0);
        if (sortBy === 'phone') return a.phoneNumber.localeCompare(b.phoneNumber);
        return (b.salePrice || 0) - (a.salePrice || 0);
      });
  }, [sims, searchQuery, operatorFilter, statusFilter, deedFilter, roundOnly, selectedHolderFilter, sortBy]);

  const totalPages = Math.ceil(filteredSims.length / pageSize) || 1;
  const paginatedSims = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSims.slice(start, start + pageSize);
  }, [filteredSims, currentPage, pageSize]);

  const totalInventoryValue = useMemo(() => {
    return filteredSims
      .filter((s) => s.status === SimStatus.AVAILABLE)
      .reduce((sum, s) => sum + (s.salePrice || 0), 0);
  }, [filteredSims]);

  /**
   * Both views of a SIM's transfer state, from the same pure functions the API
   * and the reminder scheduler use, so the column, the modal and the
   * notifications can never disagree.
   */
  const deedEligibility = (s: SimCard) => computeDeedTransferEligibility(s);
  /** Status of the operator's hand-chosen due date — this is what drives the list. */
  const deedFollow = (s: SimCard) => computeDeedFollowStatus(s);

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(paginatedSims.map((s) => s.id)) : new Set());
  };

  /** Bulk publication. Every SIM is processed independently — one invalid
   *  record never blocks the others. Results are reported per row. */
  const handleBulkPublish = async () => {
    const targets = (sims || []).filter((s) => selectedIds.has(s.id));
    if (!targets.length) return;
    setIsBulkPublishing(true);
    let ok = 0;
    let failed = 0;
    for (const sim of targets) {
      const res = await publishSim({ ...sim, websiteListingStatus: WebsiteListingStatus.PUBLISHED });
      storage.saveSimCard({
        ...sim,
        websitePublishRequested: true,
        websitePublicId: sim.websitePublicId || sim.id,
        websiteListingStatus: WebsiteListingStatus.PUBLISHED,
        websiteLastAttemptAt: new Date().toISOString(),
        websiteSyncVersion: (sim.websiteSyncVersion || 0) + 1,
        websiteSyncStatus: res.success ? WebsiteSyncStatus.SYNCED : WebsiteSyncStatus.FAILED,
        websiteLastSyncAt: res.success ? new Date().toISOString() : sim.websiteLastSyncAt,
        websiteLastErrorCode: res.success ? undefined : res.errorCode,
      });
      res.success ? ok++ : failed++;
    }
    setIsBulkPublishing(false);
    setSelectedIds(new Set());
    onRefreshSims();
    failed === 0
      ? success(isRtl ? `${ok} شماره با موفقیت منتشر شد.` : `${ok} SIM(s) published.`)
      : success(isRtl ? `${ok} منتشر شد، ${failed} ناموفق.` : `${ok} published, ${failed} failed.`);
  };

  const getWebsiteBadge = (s: SimCard) => {
    const status = s.websiteListingStatus;
    if (!status || status === 'NOT_PUBLISHED') {
      return <span className="text-[10px] text-slate-400">منتشر نشده</span>;
    }
    if (status === 'PUBLISHED') {
      const syncFail = s.websiteSyncStatus === 'FAILED';
      return (
        <span className="flex flex-col gap-0.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30 w-fit">
            منتشر شده
          </span>
          {syncFail && (
            <span className="text-[9px] text-rose-500 font-bold" title={s.websiteLastErrorCode}>
              خطا در همگام‌سازی
            </span>
          )}
        </span>
      );
    }
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-600 dark:text-slate-400 font-bold border border-slate-500/30">
        {status === 'SOLD' ? 'فروش رفته' : 'لغو منتشر'}
      </span>
    );
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(isRtl ? 'آیا از حذف این سیم‌کارت از انبار اطمینان دارید؟' : 'Are you sure you want to delete this SIM card?')) {
      storage.deleteSimCard(id);
      success(isRtl ? 'سیم‌کارت از انبار حذف شد' : 'SIM card removed from inventory');
      onRefreshSims();
    }
  };

  const openLifecycle = (sim: SimCard, mode: LifecycleMode, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setLifecycleModal({
      isOpen: true,
      sim,
      mode,
    });
  };

  const getStatusBadge = (status: SimStatus | string, isConsigned?: boolean) => {
    if (status === 'CONSIGNMENT' || isConsigned) {
      return <Badge variant="indigo" size="sm">{isRtl ? 'امانی' : 'Consignment'}</Badge>;
    }
    switch (status) {
      case SimStatus.AVAILABLE:
      case 'AVAILABLE':
        return <Badge variant="emerald" size="sm">{t('sims.statusAvailable')}</Badge>;
      case SimStatus.SOLD:
      case 'SOLD':
        return <Badge variant="default" size="sm">{t('sims.statusSold')}</Badge>;
      case SimStatus.RESERVED:
      case 'RESERVED':
        return <Badge variant="warning" size="sm">{t('sims.statusReserved')}</Badge>;
      case SimStatus.RENTED:
      case 'RENTED':
        return <Badge variant="purple" size="sm">{t('sims.statusRented')}</Badge>;
      case SimStatus.SUSPENDED:
      case 'SUSPENDED':
      default:
        return <Badge variant="danger" size="sm">{isRtl ? 'توقیف / قطع' : 'Suspended'}</Badge>;
    }
  };

  const getOperatorBadge = (op: SimOperator | string) => {
    switch (op) {
      case SimOperator.MCI:
      case 'MCI':
        return <span className="text-[11px] px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 font-bold">{t('sims.mci')}</span>;
      case SimOperator.IRANCELL:
      case 'IRANCELL':
        return <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold">{t('sims.irancell')}</span>;
      case SimOperator.RIGHTEL:
      case 'RIGHTEL':
        return <span className="text-[11px] px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-bold">{t('sims.rightel')}</span>;
      default:
        return <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-500/10 text-secondary font-bold">{op}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface p-4 rounded-2xl border border-primary shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-extrabold text-primary flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" />
              <span>{t('sims.title')}</span>
            </h1>
            <Badge variant="purple" size="sm">
              <RTLNumber value={filteredSims.length} type="count" suffix={t('sims.countSuffix')} />
            </Badge>
          </div>
          <p className="text-xs text-muted mt-0.5">
            {t('sims.subtitle')} - ارزش انبار آماده فروش: <strong className="text-success">{formatToman(totalInventoryValue)}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsHoldersModalOpen(true)}
            leftIcon={<Users className="w-4 h-4 text-primary" />}
          >
            مدیریت سندزن‌ها
          </Button>

          <ExportExcelButton
            onExport={() => exportSimsToExcel(filteredSims)}
            filename="sim_cards_inventory"
            size="sm"
          />

          <Button
            variant="primary"
            size="sm"
            onClick={onAddNewSim}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            {t('sims.newSimBtn')}
          </Button>
        </div>
      </div>

      {/* Selected Holder Filter Alert Banner */}
      {selectedHolderFilter && (
        <div className="p-3 rounded-xl bg-primary-light dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 flex items-center justify-between text-xs">
          <span>
            فیلتر فعال: سیم‌کارت‌های به نام <strong>{selectedHolderFilter.name}</strong>
          </span>
          <button
            type="button"
            onClick={() => setSelectedHolderFilter(null)}
            className="hover:text-indigo-900 dark:hover:text-indigo-100 underline text-xs font-semibold"
          >
            حذف فیلتر
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-surface liquid-glass-card border border-primary space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="w-full sm:flex-1">
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={t('sims.searchPlaceholder')}
              rightIcon={<Search className="w-4 h-4 text-muted" />}
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-primary text-xs text-secondary dark:text-slate-200 focus:outline-none focus:border-primary font-medium"
            >
              <option value="price_desc">مرتب‌سازی: گران‌ترین به ارزان‌ترین</option>
              <option value="price_asc">مرتب‌سازی: ارزان‌ترین به گران‌ترین</option>
              <option value="phone">مرتب‌سازی: شماره سیم‌کارت</option>
            </select>

            <Checkbox
              variant="pill"
              checked={roundOnly}
              onChange={(e) => {
                setRoundOnly(e.target.checked);
                setCurrentPage(1);
              }}
              label={t('sims.roundOnly')}
              icon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />}
              colorScheme="amber"
              size="sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-primary/60">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted font-medium">{t('sims.operator')}:</span>
            {['ALL', 'MCI', 'IRANCELL', 'RIGHTEL'].map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => {
                  setOperatorFilter(op);
                  setCurrentPage(1);
                }}
                className={`text-xs px-2.5 py-1 rounded-lg transition-all ${
                  operatorFilter === op
                    ? 'bg-primary text-white font-semibold shadow-md shadow-indigo-600/30'
                    : 'bg-surface-subtle dark:bg-surface-subtle/80 text-secondary hover:text-slate-900 dark:hover:text-slate-200 border border-primary'
                }`}
              >
                {op === 'ALL' ? t('common.all') : op === 'MCI' ? t('sims.mci') : op === 'IRANCELL' ? t('sims.irancell') : t('sims.rightel')}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted font-medium">{t('sims.status')}:</span>
            {['ALL', 'AVAILABLE', 'RESERVED', 'SOLD'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setStatusFilter(st);
                  setCurrentPage(1);
                }}
                className={`text-xs px-2.5 py-1 rounded-lg transition-all ${
                  statusFilter === st
                    ? 'bg-primary text-white font-semibold shadow-md shadow-indigo-600/30'
                    : 'bg-surface-subtle dark:bg-surface-subtle/80 text-secondary hover:text-slate-900 dark:hover:text-slate-200 border border-primary'
                }`}
              >
                {st === 'ALL' ? t('common.all') : st === 'AVAILABLE' ? t('sims.statusAvailable') : st === 'RESERVED' ? t('sims.statusReserved') : t('sims.statusSold')}
              </button>
            ))}
          </div>
        </div>

        {/* Transfer follow-up filter, driven by the operator's chosen due date */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-primary/60">
          <span className="text-xs text-muted font-medium">انتقال سند:</span>
          {[
            { key: 'ALL', label: 'همه' },
            { key: 'WAITING', label: 'در انتظار سررسید' },
            { key: 'DUE_TODAY', label: 'سررسید امروز' },
            { key: 'OVERDUE', label: 'سررسید گذشته' },
            { key: 'COMPLETED', label: 'انجام‌شده' },
            { key: 'NOT_SET', label: 'بدون تاریخ' },
          ].map((df) => (
            <button
              key={df.key}
              type="button"
              data-testid={`deed-filter-${df.key}`}
              onClick={() => {
                setDeedFilter(df.key);
                setCurrentPage(1);
              }}
              className={`text-xs px-2.5 py-1 rounded-lg transition-all ${
                deedFilter === df.key
                  ? 'bg-primary text-white font-semibold shadow-md shadow-indigo-600/30'
                  : 'bg-surface-subtle dark:bg-surface-subtle/80 text-secondary hover:text-slate-900 dark:hover:text-slate-200 border border-primary'
              }`}
            >
              {df.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk publication bar — only shown when rows are selected */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-800 dark:text-indigo-300">
            <Globe className="w-4 h-4 text-indigo-500" />
            <span>{isRtl ? `${formatNumber(selectedIds.size)} شماره انتخاب شده` : `${selectedIds.size} selected`}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="xs" onClick={() => setSelectedIds(new Set())}>
              {isRtl ? 'لغو انتخاب' : 'Clear'}
            </Button>
            <Button
              variant="primary"
              size="xs"
              onClick={handleBulkPublish}
              disabled={isBulkPublishing}
              leftIcon={<Globe className="w-3 h-3" />}
            >
              {isBulkPublishing
                ? (isRtl ? 'در حال انتشار...' : 'Publishing...')
                : (isRtl ? 'انتشار شماره‌های انتخاب‌شده در سایت' : 'Publish selected to website')}
            </Button>
          </div>
        </div>
      )}

      {/* Standard ListViewControls with View Toggle (Card vs Row/List) & Pagination */}
      <ListViewControls
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredSims.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 25, 50, 100]}
      />

      {/* Content: Empty State, Table View, or Card View */}
      {filteredSims.length === 0 ? (
        <div className="p-12 text-center text-muted rounded-2xl bg-surface/90 border border-primary space-y-3 shadow-xs">
          <Smartphone className="w-10 h-10 mx-auto text-muted dark:text-secondary" />
          <h3 className="text-base font-bold text-secondary">{t('sims.noSimsFound')}</h3>
          <p className="text-xs text-muted">{t('sims.noSimsDesc')}</p>
          <Button variant="primary" size="sm" onClick={onAddNewSim}>
            {t('sims.newSimBtn')}
          </Button>
        </div>
      ) : viewMode === 'list' ? (
        /* ROW / LIST VIEW (TABLE) */
        <HorizontalScrollContainer className="rounded-2xl border border-primary bg-surface shadow-2xs">
          <table className="w-full text-right text-xs">
            <thead className="bg-surface-subtle/80 text-secondary font-bold border-b border-primary">
              <tr>
                <th className="p-3 w-8">
                  <Checkbox
                    checked={paginatedSims.length > 0 && paginatedSims.every((s) => selectedIds.has(s.id))}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th className="p-3 w-40">شماره سیم‌کارت</th>
                <th className="p-3 w-28">اپراتور</th>
                <th className="p-3 w-24">نوع</th>
                <th className="p-3 w-32">قیمت فروش</th>
                <th className="p-3 w-28">وضعیت</th>
                <th className="p-3 w-32">انتشار در سایت</th>
                <th className="p-3 w-36">سندزن (دارنده)</th>
                <th className="p-3">رزرو / خریدار / رهن</th>
                <th className="p-3 w-44">تاریخ خرید / فروش / انتقال سند</th>
                <th className="p-3 text-left w-52">اقدامات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedSims.map((s) => { const elig = deedEligibility(s); const follow = deedFollow(s); return (
                <tr
                  key={s.id}
                  onClick={() => onEditSim(s)}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                >
                  {/* Bulk selection */}
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(s.id)}
                      onChange={(e) => toggleOne(s.id, e.target.checked)}
                    />
                  </td>

                  {/* Phone number */}
                  <td className="p-3 font-mono font-black text-primary text-sm whitespace-nowrap" dir="ltr">
                    <div className="flex items-center gap-1.5">
                      <span>{s.phoneNumber}</span>
                      {s.isRound && (
                        <span className="p-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400" title={s.roundCategory || 'رند'}>
                          <Sparkles className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Operator */}
                  <td className="p-3 whitespace-nowrap">
                    {getOperatorBadge(s.operator)}
                  </td>

                  {/* Type */}
                  <td className="p-3 text-secondary whitespace-nowrap">
                    {s.type === 'PERMANENT' ? t('sims.permanent') : t('sims.creditType')}
                  </td>

                  {/* Sale Price */}
                  <td className="p-3 font-bold text-primary whitespace-nowrap">
                    {s.salePrice ? formatToman(s.salePrice) : 'توافقی'}
                  </td>

                  {/* Status */}
                  <td className="p-3 whitespace-nowrap">
                    {getStatusBadge(s.status, s.isConsigned)}
                    {s.isMortgaged && (
                      <span className="mr-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-600 dark:text-purple-300 font-bold border border-purple-500/30">
                        رهنی
                      </span>
                    )}
                  </td>

                  {/* Website publication status */}
                  <td className="p-3 whitespace-nowrap">{getWebsiteBadge(s)}</td>

                  {/* Registered Holder */}
                  <td className="p-3 whitespace-nowrap text-secondary">
                    {s.registeredHolderName || '-'}
                  </td>

                  {/* Customer / Notes / Reservation */}
                  <td className="p-3 text-secondary text-[11px]">
                    {s.status === 'RESERVED' && s.reservationCustomerName && (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">
                        رزرو: {s.reservationCustomerName}
                      </span>
                    )}
                    {s.ownerCustomerName && (
                      <span className="text-primary font-semibold">
                        مالک: {s.ownerCustomerName}
                      </span>
                    )}
                    {s.notes && !s.reservationCustomerName && !s.ownerCustomerName && (
                      <span className="truncate max-w-xs block">{s.notes}</span>
                    )}
                  </td>

                  {/* Purchase / Sale / Ownership-transfer dates. The follow-up
                      status is driven by the operator's hand-chosen due date —
                      the same value the reminder scheduler follows — so the list
                      can never disagree with the modal or the notifications. */}
                  <td className="p-3 text-[11px] whitespace-nowrap space-y-0.5" data-testid="sim-dates-cell">
                    <div className="text-secondary">
                      <span className="text-muted">خرید: </span>
                      <span className="font-mono" dir="ltr">
                        {s.purchaseDate ? formatPersianDate(s.purchaseDate, true) : '—'}
                      </span>
                    </div>
                    <div className={s.saleDate ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-muted'}>
                      <span className="text-muted font-normal">فروش: </span>
                      <span className="font-mono" dir="ltr">
                        {s.saleDate ? formatPersianDate(s.saleDate, true) : '—'}
                      </span>
                    </div>
                    <div data-testid="sim-deed-cell">
                      <div
                        className={
                          follow.status === 'COMPLETED'
                            ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                            : follow.status === 'OVERDUE'
                            ? 'text-rose-600 dark:text-rose-400 font-bold'
                            : follow.status === 'DUE_TODAY'
                            ? 'text-amber-600 dark:text-amber-400 font-semibold'
                            : 'text-muted'
                        }
                      >
                        <span className="text-muted font-normal">سررسید: </span>
                        <span className="font-mono" dir="ltr">
                          {s.deedTransferDueDate ? formatPersianDate(s.deedTransferDueDate, true) : '—'}
                        </span>
                      </div>
                      <div
                        className={
                          follow.status === 'COMPLETED'
                            ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                            : follow.status === 'OVERDUE'
                            ? 'text-rose-600 dark:text-rose-400 font-bold'
                            : follow.status === 'DUE_TODAY'
                            ? 'text-amber-600 dark:text-amber-400 font-semibold'
                            : 'text-muted'
                        }
                        data-testid="sim-deed-status"
                      >
                        {deedFollowStatusLabelFa(follow.status)}
                        {follow.remainingDays !== null && ` (${deedRemainingLabelFa(follow.remainingDays)})`}
                      </div>
                      {elig.needsVerification && follow.status !== 'COMPLETED' && (
                        <div className="text-amber-600 dark:text-amber-400 font-semibold text-[10px]" data-testid="sim-deed-verification">
                          نیازمند بررسی مبنای محاسبه
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="p-3 text-left whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      {s.status === SimStatus.AVAILABLE || s.status === 'AVAILABLE' ? (
                        <>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={(e) => openLifecycle(s, 'RESERVE', e)}
                            leftIcon={<Bookmark className="w-3 h-3 text-amber-500" />}
                          >
                            رزرو
                          </Button>
                          <Button
                            variant="success"
                            size="xs"
                            onClick={(e) => openLifecycle(s, 'SELL', e)}
                            leftIcon={<ShoppingCart className="w-3 h-3" />}
                          >
                            فروش
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={(e) => openLifecycle(s, 'CONSIGNMENT', e)}
                            leftIcon={<Handshake className="w-3 h-3 text-indigo-500" />}
                          >
                            امانی
                          </Button>
                        </>
                      ) : s.status === SimStatus.RESERVED || s.status === 'RESERVED' ? (
                        <>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={(e) => openLifecycle(s, 'CANCEL_RESERVE', e)}
                            leftIcon={<XCircle className="w-3 h-3 text-rose-500" />}
                          >
                            لغو
                          </Button>
                          <Button
                            variant="success"
                            size="xs"
                            onClick={(e) => openLifecycle(s, 'SELL', e)}
                            leftIcon={<ShoppingCart className="w-3 h-3" />}
                          >
                            فروش
                          </Button>
                        </>
                      ) : null}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPublishSimState(s);
                        }}
                        className="p-1.5 text-muted hover:text-sky-600 rounded-lg hover:bg-surface-subtle dark:hover:bg-slate-800"
                        title="انتشار در وردپرس"
                      >
                        <Globe className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFinancialSim(s);
                        }}
                        className="p-1.5 text-muted hover:text-primary rounded-lg hover:bg-surface-subtle dark:hover:bg-slate-800"
                        title="وضعیت مالی"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditSim(s);
                        }}
                        className="p-1.5 text-muted hover:text-primary rounded-lg hover:bg-surface-subtle dark:hover:bg-slate-800"
                        title="ویرایش"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDelete(s.id, e)}
                        className="p-1.5 text-muted hover:text-rose-600 rounded-lg hover:bg-surface-subtle dark:hover:bg-slate-800"
                        title="حذف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </HorizontalScrollContainer>
      ) : (
        /* CARD VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {paginatedSims.map((s) => { const elig = deedEligibility(s); const follow = deedFollow(s); return (
            <div
              key={s.id}
              onClick={() => onEditSim(s)}
              className="p-4 rounded-2xl bg-surface liquid-glass-card border border-primary hover:border-indigo-400 dark:hover:border-slate-700 transition-all cursor-pointer space-y-3 flex flex-col justify-between shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-primary/80">
                  <div className="flex items-center gap-1.5">
                    {getOperatorBadge(s.operator)}
                    <span className="text-xs text-muted font-medium">
                      {s.type === 'PERMANENT' ? t('sims.permanent') : t('sims.creditType')}
                    </span>
                    {s.isMortgaged && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/30">
                        رهنی
                      </span>
                    )}
                  </div>

                  {getStatusBadge(s.status, s.isConsigned)}
                </div>

                <div className="pt-2 text-center">
                  <div className="text-lg sm:text-xl font-mono font-black text-primary dark:text-indigo-200 tracking-wider">
                    <RTLNumber value={s.phoneNumber} type="phone" />
                  </div>

                  {s.isRound && s.roundCategory && (
                    <div className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full bg-warning/10 text-warning text-[11px] font-bold border border-amber-200 dark:border-amber-500/20">
                      <Sparkles className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                      <span>{s.roundCategory}</span>
                    </div>
                  )}
                </div>

                {/* Price & Registered Holder Info */}
                <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-surface-subtle/70 border border-primary/80 space-y-1.5 text-xs" data-testid="sim-card-dates">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">تاریخ خرید:</span>
                    <span className="font-mono text-secondary" dir="ltr">
                      {s.purchaseDate ? formatPersianDate(s.purchaseDate, true) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">تاریخ فروش:</span>
                    <span className={`font-mono ${s.saleDate ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-secondary'}`} dir="ltr">
                      {s.saleDate ? formatPersianDate(s.saleDate, true) : '—'}
                    </span>
                  </div>
                  {/* Follow-up status is driven by the operator's hand-chosen due
                      date. The calculated legal eligibility is shown as a muted,
                      separate line so the two facts stay visibly distinct. */}
                  <div className={`pt-1 border-t space-y-1 ${
                    follow.status === 'COMPLETED'
                      ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold'
                      : follow.status === 'OVERDUE'
                      ? 'border-rose-500/30 text-rose-600 dark:text-rose-400 font-bold'
                      : follow.status === 'DUE_TODAY'
                      ? 'border-amber-500/30 text-amber-600 dark:text-amber-400 font-semibold'
                      : 'border-primary/40 text-muted'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span>سررسید انتقال سند:</span>
                      <span className="font-mono" dir="ltr">
                        {s.deedTransferDueDate ? formatPersianDate(s.deedTransferDueDate, true) : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span>وضعیت:</span>
                      <span>
                        {deedFollowStatusLabelFa(follow.status)}
                        {follow.remainingDays !== null ? ` (${deedRemainingLabelFa(follow.remainingDays)})` : ''}
                      </span>
                    </div>
                    {s.deedTransferCompletedAt && (
                      <div className="flex items-center justify-between text-[10px]">
                        <span>تاریخ تکمیل:</span>
                        <span className="font-mono" dir="ltr">{formatPersianDate(s.deedTransferCompletedAt, true)}</span>
                      </div>
                    )}
                    {!s.deedTransferCompletedAt && (
                      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-primary/40 opacity-80">
                        <span>مجاز قانونی از:</span>
                        <span className="font-mono" dir="ltr">
                          {elig.nextEligibleDate ? formatPersianDate(elig.nextEligibleDate, true) : '—'}
                        </span>
                      </div>
                    )}
                    {elig.needsVerification && !s.deedTransferCompletedAt && (
                      <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 pt-1 border-t border-primary/40">
                        نیازمند بررسی مبنای محاسبه
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-surface-subtle/70 border border-primary/80 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">{t('sims.salePrice')}:</span>
                    <span className="font-bold text-primary">
                      {s.salePrice ? formatToman(s.salePrice) : 'توافقی'}
                    </span>
                  </div>

                  {s.registeredHolderName && (
                    <div className="flex items-center justify-between pt-1 border-t border-primary text-[11px]">
                      <span className="text-muted flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        <span>سندزن:</span>
                      </span>
                      <span className="font-semibold text-secondary">{s.registeredHolderName}</span>
                    </div>
                  )}

                  {s.status === 'RESERVED' && s.reservationCustomerName && (
                    <div className="flex items-center justify-between pt-1 border-t border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-400">
                      <span className="flex items-center gap-1">
                        <Bookmark className="w-3 h-3" />
                        <span>رزرو برای:</span>
                      </span>
                      <span className="font-bold">{s.reservationCustomerName}</span>
                    </div>
                  )}
                </div>

                {/* Lifecycle Quick Actions */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2" onClick={(e) => e.stopPropagation()}>
                  {s.status === SimStatus.AVAILABLE || s.status === 'AVAILABLE' ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => openLifecycle(s, 'RESERVE', e)}
                        className="text-[11px] px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 font-semibold flex items-center gap-1"
                      >
                        <Bookmark className="w-3 h-3" />
                        رزرو / بیعانه
                      </button>
                      <button
                        type="button"
                        onClick={(e) => openLifecycle(s, 'SELL', e)}
                        className="text-[11px] px-2 py-1 rounded-lg bg-success/10 text-success dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 font-semibold flex items-center gap-1"
                      >
                        <ShoppingCart className="w-3 h-3" />
                        فروش قطعی
                      </button>
                      <button
                        type="button"
                        onClick={(e) => openLifecycle(s, 'CONSIGNMENT', e)}
                        className="text-[11px] px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary font-semibold flex items-center gap-1"
                      >
                        <Handshake className="w-3 h-3" />
                        امانی
                      </button>
                      <button
                        type="button"
                        onClick={(e) => openLifecycle(s, 'MORTGAGE', e)}
                        className="text-[11px] px-2 py-1 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 border border-purple-500/30 font-semibold flex items-center gap-1"
                      >
                        <Lock className="w-3 h-3" />
                        رهن
                      </button>
                    </>
                  ) : s.status === SimStatus.RESERVED || s.status === 'RESERVED' ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => openLifecycle(s, 'CANCEL_RESERVE', e)}
                        className="text-[11px] px-2 py-1 rounded-lg bg-rose-500/10 text-danger hover:bg-rose-500/20 border border-rose-500/30 font-semibold flex items-center gap-1"
                      >
                        <XCircle className="w-3 h-3" />
                        لغو رزرو
                      </button>
                      <button
                        type="button"
                        onClick={(e) => openLifecycle(s, 'SELL', e)}
                        className="text-[11px] px-2 py-1 rounded-lg bg-success/10 text-success dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 font-semibold flex items-center gap-1"
                      >
                        <ShoppingCart className="w-3 h-3" />
                        تبدیل به فروش
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="pt-2 border-t border-primary/60 flex items-center justify-between text-[11px] text-muted">
                <div>
                  {s.ownerCustomerId && s.ownerCustomerName ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCustomer(s.ownerCustomerId!);
                      }}
                      className="text-indigo-500 hover:underline"
                    >
                      {isRtl ? 'خریدار:' : 'Buyer:'} {s.ownerCustomerName}
                    </button>
                  ) : (
                    <span>{s.notes || '-'}</span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPublishSimState(s);
                    }}
                    className="p-1 hover:text-sky-600 transition-colors"
                    title="انتشار در وردپرس"
                  >
                    <Globe className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditSim(s);
                    }}
                    className="p-1 hover:text-indigo-400 transition-colors"
                    title={t('common.edit')}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(s.id, e)}
                    className="p-1 hover:text-rose-500 transition-colors"
                    title={t('common.delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Sim Publishing Modal */}
      <SimPublishModal
        isOpen={!!publishSimState}
        onClose={() => setPublishSimState(null)}
        sim={publishSimState}
        onSuccess={onRefreshSims}
      />

      {/* Registered Holders Modal */}
      <RegisteredHoldersModal
        isOpen={isHoldersModalOpen}
        onClose={() => setIsHoldersModalOpen(false)}
        currentUser={currentUser}
        onSelectHolderForFilter={(holderId, holderName) => {
          setSelectedHolderFilter({ id: holderId, name: holderName });
          setIsHoldersModalOpen(false);
          setCurrentPage(1);
        }}
      />

      {/* Sim Financial Detail Drawer */}
      {financialSim && (
        <SimFinancialDetail
          key={`fin-${financialSim.id}`}
          sim={financialSim}
          isOpen
          onClose={() => setFinancialSim(null)}
          currentUser={currentUser}
          onSimUpdated={onRefreshSims}
        />
      )}

      {/* Sim Lifecycle Modal (Reserve, Sell, Mortgage, Cancel) */}
      <SimLifecycleModal
        key={`lifecycle-${lifecycleModal.mode}-${lifecycleModal.sim?.id || 'none'}`}
        isOpen={lifecycleModal.isOpen}
        onClose={() => setLifecycleModal({ isOpen: false, sim: null, mode: 'RESERVE' })}
        sim={lifecycleModal.sim}
        mode={lifecycleModal.mode}
        currentUser={currentUser}
        allUsers={allUsers}
        customers={customers || []}
        contracts={(contracts && contracts.length > 0 ? contracts : storage.getContracts()) || []}
        onSuccess={() => {
          onRefreshSims();
          setLifecycleModal({ isOpen: false, sim: null, mode: 'RESERVE' });
        }}
      />
    </div>
  );
};
