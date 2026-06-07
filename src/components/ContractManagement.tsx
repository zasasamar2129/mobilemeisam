/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Customer, Contract, Installment, Payment } from '../types.ts';
import { getTranslation, formatCurrency } from '../translations.ts';
import { 
  FileText, 
  Plus, 
  Search, 
  Smartphone, 
  Calendar, 
  Coins, 
  Calculator, 
  Trash2, 
  FileSpreadsheet, 
  ChevronRight, 
  AlertCircle,
  Eye,
  CheckCircle
} from 'lucide-react';

interface ContractManagementProps {
  contracts: (Contract & { customer?: Customer; installments: Installment[]; payments: Payment[] })[];
  customers: Customer[];
  onAddContract: (data: any) => Promise<any>;
  onDeleteContract: (id: string) => Promise<any>;
  onSelectContract: (cnt: any) => void;
  lang: 'fa' | 'en';
}

export default function ContractManagement({
  contracts,
  customers,
  onAddContract,
  onDeleteContract,
  onSelectContract,
  lang
}: ContractManagementProps) {
  const t = getTranslation(lang);
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // New Contract form states
  const [customerId, setCustomerId] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [simNumber, setSimNumber] = useState('');
  const [contractDate, setContractDate] = useState(new Date().toISOString().substring(0, 10));
  const [totalPrice, setTotalPrice] = useState<number>(0);
  const [prepayment, setPrepayment] = useState<number>(0);
  const [monthsCount, setMonthsCount] = useState<number>(6);
  const [notes, setNotes] = useState('');

  // Live Calculations for Form Guide
  const calculatedRemaining = Math.max(0, totalPrice - prepayment);
  const calculatedMonthly = monthsCount > 0 ? Math.round(calculatedRemaining / monthsCount) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!customerId) {
      setErrorMsg(lang === 'fa' ? 'لطفاً یک مشتری انتخاب کنید' : 'Please select a customer');
      return;
    }
    if (!simNumber.trim()) {
      setErrorMsg(lang === 'fa' ? 'وارد کردن شماره محصول الزامی است' : 'Mobile number or SIM index is required');
      return;
    }
    if (monthsCount <= 0 || totalPrice <= 0) {
      setErrorMsg(lang === 'fa' ? 'تعداد ماه‌ها و قیمت قرارداد باید بزرگتر از صفر باشند' : 'Prices and terms must be positive integers');
      return;
    }

    try {
      await onAddContract({
        customerId,
        contractNumber: contractNumber.trim() || undefined,
        simNumber: simNumber.trim(),
        contractDate,
        totalPrice,
        prepayment,
        monthsCount,
        notes,
      });

      // Clear states
      setCustomerId('');
      setContractNumber('');
      setSimNumber('');
      setTotalPrice(0);
      setPrepayment(0);
      setMonthsCount(6);
      setNotes('');
      setIsAdding(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed creating lease plan');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(lang === 'fa' ? 'آیا از حذف این قرارداد و تمامی اقساط و پرداختی‌های مربوطه اطمینان دارید؟ این عمل غیرقابل بازگشت است.' : 'Are you sure you want to delete this contract along with associated billing installments? This action cannot be undone.')) {
      try {
        await onDeleteContract(id);
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const filteredContracts = contracts.filter(
    c => c.simNumber.includes(search) || 
         c.contractNumber.toLowerCase().includes(search.toLowerCase()) ||
         (c.customer && c.customer.fullName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      
      {/* Search & Setup Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-xl glass-card">
        <div className="relative flex-1 max-w-md">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 ${lang === 'fa' ? 'right-3' : 'left-3'}`} />
          <input
            type="text"
            placeholder={lang === 'fa' ? 'جستجوی قرارداد بر اساس شماره محصول/نام مشتری...' : 'Search contract by SIM/Client name...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full py-2 bg-black border border-gold/20 rounded-lg text-sm text-white ${lang === 'fa' ? 'pr-10' : 'pl-10'}`}
          />
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="px-4 py-2 mt-2 sm:mt-0 bg-gold text-black rounded-lg hover:bg-gold-hover transition-all text-sm font-display font-semibold flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {t.addNewContract}
        </button>
      </div>

      {/* Creation form */}
      {isAdding && (
        <form onSubmit={handleSubmit} className="p-6 rounded-2xl glass-card border-gold/30 space-y-6 max-w-3xl animate-gold-glow">
          <div className="border-b border-gold/20 pb-2">
            <h3 className="text-base font-bold text-gold flex items-center gap-2">
              <FileText className="w-5 h-5 text-gold" />
              {t.addNewContract}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Customer select */}
            <div className="space-y-1">
              <label className="text-xs text-gray-400 block">{t.fullName}</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
                className="w-full text-sm p-2 bg-black text-white"
              >
                <option value="">{lang === 'fa' ? '--- انتخاب مشتری ---' : '--- Choose Customer ---'}</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.phoneNumber})
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Contract number (optional) */}
            <div className="space-y-1">
              <label className="text-xs text-gray-400 block">{t.contractNumber} ({lang === 'fa' ? 'اختیاری' : 'Optional'})</label>
              <input
                type="text"
                placeholder="e.g. MC-2026-90"
                value={contractNumber}
                onChange={(e) => setContractNumber(e.target.value)}
                className="w-full text-sm p-3 font-mono"
              />
            </div>

            {/* SIM or Mobile product number */}
            <div className="space-y-1">
              <label className="text-xs text-gray-400 block">{t.simNumber}</label>
              <input
                type="text"
                value={simNumber}
                onChange={(e) => setSimNumber(e.target.value)}
                placeholder="e.g. 09121234567"
                required
                className="w-full text-sm p-3 font-mono text-gold font-bold tracking-widest"
              />
            </div>

            {/* Contract Date */}
            <div className="space-y-1">
              <label className="text-xs text-gray-400 block">{t.contractDate}</label>
              <input
                type="date"
                value={contractDate}
                onChange={(e) => setContractDate(e.target.value)}
                required
                className="w-full text-sm p-3 font-mono"
              />
            </div>

            {/* Total Face value */}
            <div className="space-y-1">
              <label className="text-xs text-gray-400 block">{t.totalPrice} ({t.rial})</label>
              <input
                type="number"
                value={totalPrice || ''}
                onChange={(e) => setTotalPrice(Number(e.target.value))}
                required
                className="w-full text-sm p-3 font-mono font-bold"
              />
            </div>

            {/* Down prepayment */}
            <div className="space-y-1">
              <label className="text-xs text-gray-400 block">{t.prepayment} ({t.rial})</label>
              <input
                type="number"
                value={prepayment || ''}
                onChange={(e) => setPrepayment(Number(e.target.value))}
                required
                className="w-full text-sm p-3 font-mono"
              />
            </div>

            {/* Months Count */}
            <div className="space-y-1">
              <label className="text-xs text-gray-400 block">{t.monthsCount}</label>
              <input
                type="number"
                min="1"
                max="36"
                value={monthsCount}
                onChange={(e) => setMonthsCount(Number(e.target.value))}
                required
                className="w-full text-sm p-3 font-mono"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs text-gray-400 block">{t.notes}</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={lang === 'fa' ? 'ضمانت اخذ شده، یادداشت‌ها...' : 'Collateral details, notes...'}
                className="w-full text-sm p-3"
              />
            </div>

          </div>

          {/* Automatic Calculations real-time HUD */}
          <div className="p-4 bg-black/60 rounded-xl border border-turquoise/20 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-turquoise/10 text-turquoise rounded-lg">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block">{t.remainingBalance}</span>
                <span className="text-sm font-bold text-turquoise font-mono">
                  {formatCurrency(calculatedRemaining, lang)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gold/10 text-gold rounded-lg">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block">{t.monthlyInstallment}</span>
                <span className="text-sm font-bold text-gold font-mono">
                  {formatCurrency(calculatedMonthly, lang)} / {lang === 'fa' ? 'ماه' : 'mo'}
                </span>
              </div>
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs text-rose-400 bg-rose-950/20 p-2 rounded-lg border border-rose-500/10 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-5 py-2 text-sm bg-turquoise text-black font-semibold rounded-lg hover:bg-turquoise-hover cursor-pointer"
            >
              {t.save}
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-5 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700 cursor-pointer"
            >
              {t.cancel}
            </button>
          </div>
        </form>
      )}

      {/* Existing list */}
      <div className="overflow-x-auto rounded-xl border border-gray-800 bg-black/40">
        <table className="w-full text-sm text-center text-gray-300">
          <thead className="text-xs text-gray-400 bg-gray-900 bg-opacity-70 uppercase border-b border-gray-800">
            <tr>
              <th className="py-3 px-4">{t.contractNumber}</th>
              <th className="py-3 px-4">{t.fullName}</th>
              <th className="py-3 px-4">{t.simNumber}</th>
              <th className="py-3 px-4">{t.remainingBalance}</th>
              <th className="py-3 px-4">{t.monthsCount}</th>
              <th className="py-3 px-4">{t.status}</th>
              <th className="py-3 px-4">{t.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60 font-sans">
            {filteredContracts.map(c => {
              const paidCount = c.installments.filter(i => i.status === 'paid').length;
              return (
                <tr key={c.id} className="hover:bg-gray-900/30 transition-colors">
                  
                  {/* Contract Number */}
                  <td className="py-3 px-4 font-mono font-bold text-gray-200">
                    {c.contractNumber}
                  </td>
                  
                  {/* Customer display */}
                  <td className="py-3 px-4 font-bold text-gray-100">
                    {c.customer ? c.customer.fullName : 'Deleted Customer'}
                  </td>

                  {/* SIM Card display */}
                  <td className="py-3 px-4 text-gold font-mono font-bold tracking-widest text-xs">
                    {c.simNumber}
                  </td>

                  {/* Outstanding balance */}
                  <td className="py-3 px-4 font-semibold font-mono text-cyan-400">
                    {formatCurrency(c.remainingBalance, lang)}
                  </td>

                  {/* Amortization state */}
                  <td className="py-3 px-4 text-xs font-mono text-gray-400">
                    <span className="text-turquoise font-medium">{paidCount}</span> / {c.monthsCount} {lang === 'fa' ? 'قسط' : 'mo'}
                  </td>

                  {/* Status stage */}
                  <td className="py-3 px-4">
                    <span className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                      c.status === 'finished'
                        ? 'bg-turquoise/10 text-turquoise border border-turquoise/20'
                        : c.status === 'terminated'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-gold/10 text-gold border border-gold/20'
                    }`}>
                      {c.status === 'finished' ? t.finished : c.status === 'terminated' ? t.terminated : t.active}
                    </span>
                  </td>

                  {/* Actions column */}
                  <td className="py-3 px-4">
                    <div className="flex justify-center items-center gap-2">
                      <button
                        onClick={() => onSelectContract(c)}
                        className="p-1.5 rounded bg-turquoise/20 text-turquoise hover:bg-turquoise hover:text-black transition-colors cursor-pointer"
                        title={t.viewStatement}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="p-1.5 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
                        title={t.delete}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>

                </tr>
              );
            })}
            
            {filteredContracts.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-gray-500 font-medium">
                  {lang === 'fa' ? 'هیچ قراردادی مطابق جستجو پیدا نشد.' : 'No contracts correspond to this catalog.'}
                </td>
              </tr>
            )}

          </tbody>
        </table>
      </div>

    </div>
  );
}
