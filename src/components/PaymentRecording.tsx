/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Customer, Contract, Installment, Payment } from '../types.ts';
import { getTranslation, formatCurrency } from '../translations.ts';
import { 
  Coins, 
  Calendar, 
  Upload, 
  FileText, 
  AlertCircle, 
  Image as ImageIcon,
  CheckCircle,
  X 
} from 'lucide-react';

interface PaymentRecordingProps {
  contracts: (Contract & { customer?: Customer })[];
  onRecordPayment: (data: any) => Promise<any>;
  lang: 'fa' | 'en';
}

export default function PaymentRecording({ contracts, onRecordPayment, lang }: PaymentRecordingProps) {
  const t = getTranslation(lang);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [contractId, setContractId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().substring(0, 10));
  const [notes, setNotes] = useState('');
  const [receiptImage, setReceiptImage] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Find selected contract outstanding properties
  const selectedContract = contracts.find(c => c.id === contractId);

  // Helper to handle reading file and converting to Base64
  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg(lang === 'fa' ? 'فقط تصاویر فاکتور/رسید مورد تایید می‌باشند' : 'Only image files are accepted');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setReceiptImage(reader.result as string);
      setSuccessMsg(t.receiptSuccess);
      setErrorMsg('');
    };
    reader.onerror = () => {
      setErrorMsg('Error reading file / خطا در خواندن فایل');
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const removeReceipt = () => {
    setReceiptImage(null);
    setSuccessMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSelectContract = (id: string) => {
    setContractId(id);
    const contract = contracts.find(c => c.id === id);
    if (contract) {
      // Propose current monthly installment as default amount
      setAmount(contract.monthlyInstallment);
    } else {
      setAmount(0);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!contractId) {
      setErrorMsg(lang === 'fa' ? 'لطفاً یک قرارداد را انتخاب کنید' : 'Please select a contract matched');
      return;
    }
    if (amount <= 0) {
      setErrorMsg(lang === 'fa' ? 'مبلغ واریزی باید بزرگتر از صفر باشد' : 'Payment amount must be greater than zero');
      return;
    }

    try {
      await onRecordPayment({
        contractId,
        amount,
        paymentDate,
        receiptImage,
        notes,
      });

      // Clear states
      setContractId('');
      setAmount(0);
      setNotes('');
      setReceiptImage(null);
      setSuccessMsg(lang === 'fa' ? 'تراکنش پرداخت قسط با موفقیت ثبت شد و مانده بدهی کسر گردید.' : 'Payment logged into master ledger and outstanding balance adjusted.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error executing transactional posting');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      
      {/* Title */}
      <div className="border-b border-gold/20 pb-2">
        <h2 className="text-xl font-bold text-gold flex items-center gap-2">
          <Coins className="w-5 h-5 text-gold" />
          {t.recordNewPayment}
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          {lang === 'fa' ? 'وصول اقساط، بارگذاری تصویر پرینت بانکی و تاییدیه باقیمانده بدهی' : 'Post client amortization payments to live master records.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 rounded-2xl glass-card space-y-6 animate-gold-glow">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Target contract selection dropdown */}
          <div className="space-y-1">
            <label className="text-xs text-gray-400 block">{t.selectContract}</label>
            <select
              value={contractId}
              onChange={(e) => handleSelectContract(e.target.value)}
              required
              className="w-full text-sm p-3 bg-black text-white"
            >
              <option value="">{lang === 'fa' ? '--- انتخاب قرارداد فعال ---' : '--- Choose Active Contract ---'}</option>
              {contracts
                .filter(c => c.status === 'active')
                .map(c => (
                  <option key={c.id} value={c.id}>
                    {c.contractNumber} - {c.customer?.fullName || ''} ({c.simNumber})
                  </option>
                ))}
            </select>
          </div>

          {/* Amount parameter */}
          <div className="space-y-1">
            <label className="text-xs text-gray-400 block">{t.paymentAmount} ({t.rial})</label>
            <input
              type="number"
              value={amount || ''}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
              className="w-full text-sm p-3 font-mono font-bold text-turquoise"
            />
          </div>

          {/* Display current outstanding information for helper feedback */}
          {selectedContract && (
            <div className="md:col-span-2 p-4 bg-black/60 rounded-xl border border-gold/15 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <span className="text-[10px] text-gray-400 block">{lang === 'fa' ? 'نام خریدار' : 'Client'}</span>
                <span className="text-xs font-bold text-white">{selectedContract.customer?.fullName}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block">{t.remainingBalance}</span>
                <span className="text-xs font-bold text-rose-400 font-mono">
                  {formatCurrency(selectedContract.remainingBalance, lang)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block">{t.monthlyInstallment}</span>
                <span className="text-xs font-bold text-gold font-mono">
                  {formatCurrency(selectedContract.monthlyInstallment, lang)}
                </span>
              </div>
            </div>
          )}

          {/* Payment Date value */}
          <div className="space-y-1">
            <label className="text-xs text-gray-400 block">{t.paymentDate}</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
              className="w-full text-sm p-3 font-mono text-gray-100"
            />
          </div>

          {/* Payments Notes remarks */}
          <div className="space-y-1">
            <label className="text-xs text-gray-400 block">{t.paymentNotes}</label>
            <input
              type="text"
              placeholder={lang === 'fa' ? 'مثال: واریز پایا شعبه تجریش...' : 'e.g. Bank wire ref 19920...'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-sm p-3"
            />
          </div>

        </div>

        {/* DRAG-AND-DROP FILE UPLOAD UX */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 block">{t.receiptImage}</label>
          
          {!receiptImage ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                isDragging 
                  ? 'border-turquoise bg-turquoise/5' 
                  : 'border-gold/20 hover:border-gold/50 bg-black/40'
              }`}
            >
              <Upload className="w-10 h-10 text-gold animate-bounce" />
              <div className="space-y-1 text-center">
                <p className="text-sm text-gray-200 font-semibold">{t.receiptPlaceholder}</p>
                <p className="text-xs text-gray-500">{lang === 'fa' ? 'فایل‌های تصویر JPG, PNG تا سقف ۵ مگابایت' : 'JPG or PNG images up to 5MB'}</p>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
            </div>
          ) : (
            <div className="relative rounded-xl border border-gold/30 bg-black overflow-hidden p-4 flex flex-col sm:flex-row items-center gap-4">
              <img 
                src={receiptImage} 
                alt="Receipt receipt transaction" 
                referrerPolicy="no-referrer"
                className="w-24 h-24 object-cover rounded-lg border border-gold/10" 
              />
              <div className="flex-1 space-y-1 text-center sm:text-right">
                <p className="text-sm text-turquoise font-semibold flex items-center justify-center sm:justify-start gap-1">
                  <CheckCircle className="w-4 h-4" />
                  {t.receiptSuccess}
                </p>
                <p className="text-xs text-gray-500 font-mono">{lang === 'fa' ? 'رسید رمزگذاری شده Base64 هماهنگ شده' : 'Secure Base64 Image matching'}</p>
              </div>
              <button
                type="button"
                onClick={removeReceipt}
                className="p-1 px-3 bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500 hover:text-white rounded-lg transition-all text-xs flex items-center gap-1 cursor-pointer mt-2 sm:mt-0"
              >
                <X className="w-4 h-4" />
                {lang === 'fa' ? 'حذف رسید' : 'Remove image'}
              </button>
            </div>
          )}
        </div>

        {/* Feedback alerts */}
        {errorMsg && (
          <p className="text-xs text-rose-400 bg-rose-950/20 p-2 rounded-lg border border-rose-500/10 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </p>
        )}

        {successMsg && !errorMsg && (
          <p className="text-xs text-turquoise bg-turquoise/10 p-2 rounded-lg border border-turquoise/25 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            {successMsg}
          </p>
        )}

        {/* Form Actions */}
        <button
          type="submit"
          className="w-full py-3 bg-gold text-black hover:bg-gold-hover rounded-xl text-sm font-display font-black tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <CheckCircle className="w-4 h-4 text-black" />
          {t.submitPayment}
        </button>

      </form>
    </div>
  );
}
