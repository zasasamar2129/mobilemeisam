/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { Customer, Contract, Installment, Payment } from '../types.ts';
import { getTranslation, formatCurrency } from '../translations.ts';
import { Printer, Crown, Smartphone, Calendar, FileText, CheckCircle, Download, AlertTriangle, ExternalLink } from 'lucide-react';

interface CustomerStatementProps {
  customer: Customer;
  contract: Contract & { installments: Installment[]; payments: Payment[] };
  lang: 'fa' | 'en';
  onBack?: () => void;
}

export default function CustomerStatement({ customer, contract, lang, onBack }: CustomerStatementProps) {
  const t = getTranslation(lang);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const totalPaid = contract.payments.reduce((sum, p) => sum + p.amount, 0);
  const totalDuePaidCount = contract.installments.filter(i => i.status === 'paid').length;
  const totalInstallmentsCount = contract.installments.length;
  const unPaidCount = totalInstallmentsCount - totalDuePaidCount;

  // Determine if the application runs inside an iframe (where standard window.print() is blocked/restricted by sandbox)
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;

  const handlePrint = () => {
    // Inject clean print override styling to format and print the receipt page cleanly
    const style = document.createElement('style');
    style.id = 'invoice-print-styles';
    style.innerHTML = `
      @media print {
        /* Hide layout navigation and controls */
        .no-print {
          display: none !important;
        }
        body {
          background: #FFFFFF !important;
          color: #000000 !important;
          font-family: 'Vazirmatn', 'Inter', sans-serif !important;
          direction: ${lang === 'fa' ? 'rtl' : 'ltr'} !important;
          padding: 10px !important;
        }
        /* Standard luxury border alignment for printing sheets */
        .print-box {
          border: 2px solid #D4AF37 !important;
          border-radius: 12px !important;
          padding: 24px !important;
          box-shadow: none !important;
          background: #FFFFFF !important;
        }
        .glass-card, .bg-black, .bg-black\\/60, .bg-gray-900 bg-opacity-70, .bg-black\\/40 {
          background-color: #F9FAFB !important;
          border-color: #E5E7EB !important;
          color: #111827 !important;
          box-shadow: none !important;
        }
        .text-white {
          color: #111827 !important;
        }
        .text-gray-400, .text-gray-300 {
          color: #4B5563 !important;
        }
        .text-gold {
          color: #AA841C !important;
        }
        .text-turquoise {
          color: #0284C7 !important;
        }
        .border-gold\\/20, .border-gold\\/10, .border-gray-800 {
          border-color: #D4AF37 !important;
        }
        table {
          width: 100% !important;
          border-collapse: collapse !important;
          margin-top: 15px !important;
        }
        th, td {
          border: 1px solid #D1D5DB !important;
          padding: 8px !important;
          text-align: center !important;
          color: #111827 !important;
        }
        th {
          background-color: #F3F4F6 !important;
        }
      }
    `;
    document.head.appendChild(style);
    
    // Trigger native printing
    try {
      window.print();
    } catch (e) {
      console.warn("Direct Printing is restricted inside iframe sandbox:", e);
    }
    
    // Remove injected print styling tag after print dialog closes
    setTimeout(() => {
      const existingTag = document.getElementById('invoice-print-styles');
      if (existingTag) {
        existingTag.remove();
      }
    }, 1500);
  };

  const handleDownloadHtml = () => {
    if (!printAreaRef.current) return;
    const printableContent = printAreaRef.current.innerHTML;

    // Build a beautifully self-contained interactive file that matches the dark gold premium design perfectly and allows offline print
    const template = `<!DOCTYPE html>
<html lang="${lang === 'fa' ? 'fa' : 'en'}" dir="${lang === 'fa' ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${lang === 'fa' ? 'سند رسمی صورت‌حساب' : 'Official Statement'} - ${customer.fullName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;900&family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Vazirmatn', 'Inter', sans-serif;
      background-color: #000000;
      color: #F3F4F6;
    }
    .glass-card {
      background: rgba(13, 13, 13, 0.9);
      border: 1px solid rgba(212, 175, 55, 0.15);
      backdrop-filter: blur(12px);
    }
    .text-gold {
      color: #D4AF37;
    }
    .text-turquoise {
      color: #3AA6A6;
    }
    .border-gold\\/20 {
      border-color: rgba(212, 175, 55, 0.2);
    }
    .border-gold\\/10 {
      border-color: rgba(212, 175, 55, 0.1);
    }
    .border-turquoise\\/20 {
      border-color: rgba(58, 166, 166, 0.2);
    }
    .bg-black\\/60 {
      background-color: rgba(10, 10, 10, 0.6) !important;
    }
    @media print {
      body {
        background: #FFFFFF !important;
        color: #000000 !important;
      }
      .no-print {
        display: none !important;
      }
      .print-box {
        border: 2px solid #D4AF37 !important;
        border-radius: 12px !important;
        padding: 24px !important;
        background: #FFFFFF !important;
        box-shadow: none !important;
      }
      .glass-card, .bg-black, .bg-black\\/60, .bg-black\\/40 {
        background-color: #F9FAFB !important;
        border-color: #E5E7EB !important;
        color: #111827 !important;
        box-shadow: none !important;
      }
      .text-white, .text-gray-100, .text-gray-200, .text-gray-300 {
        color: #111827 !important;
      }
      .text-gray-400, .text-gray-500 {
        color: #4B5563 !important;
      }
      .text-gold {
        color: #AA841C !important;
      }
      .text-turquoise {
        color: #0284C7 !important;
      }
      .border-gold\\/20, .border-gold\\/10, .border-turquoise\\/20, .border-gray-800 {
        border-color: #D4AF37 !important;
      }
      table {
        width: 100% !important;
        border-collapse: collapse !important;
      }
      th, td {
        border: 1px solid #D1D5DB !important;
        padding: 8px !important;
        color: #111827 !important;
      }
      th {
        background-color: #F3F4F6 !important;
      }
    }
  </style>
</head>
<body class="p-4 md:p-8">
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- Inline Controller inside downloaded file -->
    <div class="bg-amber-950/20 border border-gold/30 p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4 no-print shadow-xl">
      <div>
        <h4 class="font-bold text-gold text-base">${lang === 'fa' ? 'فایل صورت‌حساب آفلاین هوشمند' : 'Smart Offline Invoice Document'}</h4>
        <p class="text-xs text-gray-300 mt-1">
          ${lang === 'fa' ? 'این فایل ۱۰۰٪ آفلاین است. کلیدهای Ctrl+P یا Cmd+P را برای ذخیره راحت به عنوان فایل PDF یا چاپ مستقیم بفشارید.' : 'This file is 100% self-contained. Press Ctrl+P or Cmd+P to save as a flawless PDF or print directly.'}
        </p>
      </div>
      <button onclick="window.print()" class="px-5 py-2.5 font-bold text-sm bg-gradient-to-r from-gold to-yellow-600 text-black rounded-xl hover:opacity-90 shadow-lg cursor-pointer transition-all flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
        ${lang === 'fa' ? 'پرینت / دانلود مستقیم به صورت PDF' : 'Print / Save direct PDF'}
      </button>
    </div>

    <!-- Statement Wrapper -->
    <div class="print-box rounded-2xl glass-card p-6 md:p-8 space-y-8">
      ${printableContent}
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([template], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = customer.fullName.trim().replace(/\s+/g, '_');
    link.setAttribute('download', `Statement_${contract.contractNumber}_${safeName}.html`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Action panel */}
      <div className="flex flex-col gap-4 p-5 rounded-xl glass-card no-print">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gold flex items-center gap-2">
              <Crown className="w-5 h-5 text-gold" />
              {t.viewStatement} ({contract.contractNumber})
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {lang === 'fa' ? 'امکان چاپ دیجیتال فاکتور و دانلود نسخه PDF معتبر' : 'Generate printable luxury accounts & certified PDF receipt.'}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="px-4 py-2 text-sm font-medium border border-gray-700 rounded-lg hover:bg-gray-900 transition-colors cursor-pointer"
              >
                {t.backToHome}
              </button>
            )}
            
            {/* HTML Fallback Button (Excellent for restricted frames) */}
            <button
              onClick={handleDownloadHtml}
              className="px-4 py-2 text-sm font-medium border border-[#3AA6A6] text-[#3AA6A6] hover:bg-[#3AA6A6]/10 rounded-lg transition-all flex items-center gap-2 cursor-pointer"
              title={lang === 'fa' ? 'پیش‌فاکتور را به عنوان فایل مستقل دانلود کنید' : 'Download the invoice as a local document'}
            >
              <Download className="w-4 h-4" />
              {lang === 'fa' ? 'دانلود فایل آفلاین (HTML)' : 'Download Offline Document'}
            </button>

            <button
              onClick={handlePrint}
              className="px-5 py-2 text-sm font-medium bg-gold text-black rounded-lg hover:bg-gold-hover transition-all flex items-center gap-2 font-display font-semibold cursor-pointer"
            >
              <Printer className="w-4 h-4 text-black" />
              {t.printReceipt}
            </button>
          </div>
        </div>

        {/* Dynamic Warning Notification for Sandbox Iframes */}
        {isIframe && (
          <div className="bg-amber-950/25 border border-gold/20 rounded-lg p-3 text-xs flex gap-3 text-gold/90 leading-relaxed">
            <AlertTriangle className="w-5 h-5 text-gold shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white">
                {lang === 'fa' ? 'نکته امنیتی برای مرورگر شما:' : 'Browser Sandboxing Notice:'}
              </p>
              <p className="mt-1">
                {lang === 'fa' 
                  ? 'نمایشگر فعلی متصل به فریمورک ممکن است مانع از اجرای ابزار پرینت شود. برای چاپ واقعی و ذخیره فاکتور، می‌توانید دکمه "دانلود فایل آفلاین" را زده یا دکمه "Open in New Tab" در بالای وب‌سایت را فشار دهید.'
                  : 'Because this preview runs in an iframe sandbox, the native print popup may be restricted. To ensure hassle-free printing/PDF save, click the "Download Offline Document" button or tap "Open in New Tab" in the top corner of the pane.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Printable Area */}
      <div ref={printAreaRef} className="print-box rounded-2xl glass-card p-6 md:p-8 space-y-8 animate-gold-glow">
        
        {/* Printable Header */}
        <div className={`flex flex-col md:flex-row justify-between items-center pb-6 border-b border-gold/20 gap-6 ${lang === 'fa' ? 'md:flex-row-reverse' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-black rounded-xl border border-gold/40 flex items-center justify-center">
              <Crown className="w-8 h-8 text-gold animate-pulse" />
            </div>
            <div className={lang === 'fa' ? 'text-right' : 'text-left'}>
              <h1 className="text-2xl font-black text-white tracking-wide font-display">{t.appName}</h1>
              <p className="text-xs text-gold uppercase tracking-widest">{t.appSubName}</p>
            </div>
          </div>
          
          <div className={`text-center md:text-right ${lang === 'fa' ? 'md:text-left' : 'md:text-right'} text-sm text-gray-400 space-y-1`}>
            <p className="font-mono text-gray-200">Ref: {contract.contractNumber}</p>
            <p>{t.printDate}: {new Date().toISOString().substring(0, 10)}</p>
            <p className="text-turquoise font-medium tracking-wider">Mobile Meisam VIP Client</p>
          </div>
        </div>

        {/* Client details / Contract Specs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-4 rounded-xl bg-black/60 border border-gold/10">
            <span className="text-xs text-gray-400 block mb-1">{t.invoiceTo}</span>
            <span className="text-base font-bold text-gray-100 block">{customer.fullName}</span>
            <span className="text-xs text-gray-500 block mt-1 font-mono">{customer.phoneNumber}</span>
          </div>

          <div className="p-4 rounded-xl bg-black/60 border border-gold/10">
            <span className="text-xs text-gray-400 block mb-1">{t.simCardLabel}</span>
            <span className="text-base font-bold text-gold block font-mono tracking-widest">{contract.simNumber}</span>
            <span className="text-xs text-turquoise block mt-1">{t.contractDetails}</span>
          </div>

          <div className="p-4 rounded-xl bg-black/60 border border-gold/10">
            <span className="text-xs text-gray-400 block mb-1">{t.contractDate}</span>
            <span className="text-base font-bold text-gray-100 block font-mono">{contract.contractDate}</span>
            <span className="text-xs text-gray-500 block mt-1">{t.endDate}: {contract.endDate}</span>
          </div>

          <div className="p-4 rounded-xl bg-black/60 border border-gold/10">
            <span className="text-xs text-gray-400 block mb-1">{t.status}</span>
            <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full mt-1 ${
              contract.status === 'finished'
                ? 'bg-turquoise/20 text-turquoise border border-turquoise/40'
                : 'bg-gold/20 text-gold border border-gold/40'
            }`}>
              {contract.status === 'finished' ? t.finished : contract.status === 'terminated' ? t.terminated : t.active}
            </span>
            {contract.status === 'finished' && (
              <span className="text-xs text-turquoise block mt-1">{t.congratulationsFinished}</span>
            )}
          </div>
        </div>

        {/* Financial ledger card row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="p-6 rounded-2xl glass-card border-gold/20 flex flex-col justify-between space-y-4">
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wider block">{t.totalPrice}</span>
              <span className="text-2xl font-extrabold text-white mt-1 block">
                {formatCurrency(contract.totalPrice, lang)}
              </span>
            </div>
            <div className="text-xs text-gray-500 border-t border-gray-800/60 pt-2 flex justify-between">
              <span>{t.prepayment}:</span>
              <span className="font-semibold text-gray-300">{formatCurrency(contract.prepayment, lang)}</span>
            </div>
          </div>

          <div className="p-6 rounded-2xl glass-card border-turquoise/20 flex flex-col justify-between space-y-4">
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wider block">{t.totalpaid}</span>
              <span className="text-2xl font-extrabold text-turquoise mt-1 block">
                {formatCurrency(totalPaid, lang)}
              </span>
            </div>
            <div className="text-xs text-gray-500 border-t border-gray-800/60 pt-2 flex justify-between">
              <span>{t.paidInstallments}</span>
              <span className="font-semibold text-turquoise">{totalDuePaidCount} / {totalInstallmentsCount}</span>
            </div>
          </div>

          <div className="p-6 rounded-2xl glass-card border-gold/20 flex flex-col justify-between space-y-4">
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wider block font-medium">{t.remainingBalance}</span>
              <span className="text-2xl font-extrabold text-gold mt-1 block">
                {formatCurrency(contract.remainingBalance, lang)}
              </span>
            </div>
            <div className="text-xs text-gray-500 border-t border-gray-800/60 pt-2 flex justify-between">
              <span>{t.unpaidInstallments}</span>
              <span className="font-semibold text-gold">{unPaidCount} {lang === 'fa' ? 'قسط' : 'months'}</span>
            </div>
          </div>

        </div>

        {/* Amortization schedule Table */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-gray-800 pb-2">
            <Calendar className="w-5 h-5 text-gold" />
            {t.installmentsGrid}
          </h3>
          
          <div className="overflow-x-auto rounded-xl border border-gray-800 bg-black/40">
            <table className="w-full text-sm text-center text-gray-300">
              <thead className="text-xs tracking-wider text-gray-400 bg-gray-900 bg-opacity-70 uppercase border-b border-gray-800">
                <tr>
                  <th className="py-3 px-4">{t.installmentNo}</th>
                  <th className="py-3 px-4">{t.dueDate}</th>
                  <th className="py-3 px-4">{t.amount}</th>
                  <th className="py-3 px-4">{t.paymentStatus}</th>
                  <th className="py-3 px-4">{t.paymentDate}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {contract.installments.map((inst, index) => (
                  <tr key={inst.id} className="hover:bg-gray-900/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-gray-400">#{inst.installmentNumber}</td>
                    <td className="py-3 px-4 font-mono">{inst.dueDate}</td>
                    <td className="py-3 px-4 font-semibold text-gray-200">{formatCurrency(inst.amount, lang)}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                        inst.status === 'paid'
                          ? 'bg-turquoise/15 text-turquoise border border-turquoise/30'
                          : inst.status === 'overdue'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {inst.status === 'paid' ? t.paid : inst.status === 'overdue' ? t.overdue : t.pending}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-400">{inst.paidDate || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payments list Table */}
        {contract.payments.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-gray-800 pb-2">
              <FileText className="w-5 h-5 text-turquoise" />
              {t.paymentHistory}
            </h3>
            
            <div className="overflow-x-auto rounded-xl border border-gray-800 bg-black/40">
              <table className="w-full text-sm text-center text-gray-300">
                <thead className="text-xs tracking-wider text-gray-400 bg-gray-900 bg-opacity-70 uppercase border-b border-gray-800">
                  <tr>
                    <th className="py-3 px-4">{t.id}</th>
                    <th className="py-3 px-4">{t.paymentAmount}</th>
                    <th className="py-3 px-4">{t.paymentDate}</th>
                    <th className="py-3 px-4">{t.notes}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {contract.payments.map((pay) => (
                    <tr key={pay.id} className="hover:bg-gray-900/40 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-gray-500">{pay.id}</td>
                      <td className="py-3 px-4 font-bold text-turquoise">{formatCurrency(pay.amount, lang)}</td>
                      <td className="py-3 px-4 font-mono">{pay.paymentDate}</td>
                      <td className="py-3 px-4 text-xs text-gray-400">{pay.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Legal Disclaimer & Stamp Block */}
        <div className={`pt-6 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-6 ${lang === 'fa' ? 'md:flex-row-reverse' : ''}`}>
          <div className="max-w-md text-center md:text-right">
            <p className="text-xs text-gray-400 leading-relaxed font-sans mt-1">
              {t.aboutUsFooter}
            </p>
          </div>
          
          {/* Stamp signature */}
          <div className="border-2 border-gold/40 rounded-xl p-4 text-center font-display relative rotate-2 max-w-[200px] bg-black bg-opacity-50">
            <Crown className="w-6 h-6 text-gold mx-auto mb-1 animate-pulse" />
            <p className="text-gold font-bold text-xs uppercase tracking-widest">{t.appName}</p>
            <p className="text-[10px] text-turquoise tracking-tighter mt-1">{lang === 'fa' ? 'دفتر واگذاری رسمی طلایی' : 'Certified Registry Office'}</p>
            <div className="absolute right-1 bottom-1 w-2 h-2 rounded-full bg-gold/50"></div>
          </div>
        </div>

      </div>
    </div>
  );
}
