/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { getTranslation, formatCurrency } from '../translations.ts';
import { ActivityLog, NotificationItem } from '../types.ts';
import { 
  Users, 
  Smartphone, 
  CheckCircle, 
  TrendingUp, 
  AlertCircle, 
  Bell, 
  Clock, 
  Check, 
  ArrowUpRight 
} from 'lucide-react';

interface AdminDashboardProps {
  stats: {
    totalCustomers: number;
    activeContracts: number;
    finishedContracts: number;
    totalOutstandingBalance: number;
    overdueCount: number;
    monthlyIncomeChart: { month: string; income: number }[];
    collectionRate: number;
    recentActivity: ActivityLog[];
  };
  notifications: NotificationItem[];
  onMarkNotificationRead: (id: string) => void;
  lang: 'fa' | 'en';
}

export default function AdminDashboard({ 
  stats, 
  notifications, 
  onMarkNotificationRead, 
  lang 
}: AdminDashboardProps) {
  const t = getTranslation(lang);
  
  const unreadNotifications = notifications.filter(n => !n.isRead);

  // Helper to format months gracefully in Persian/English
  const formatMonthLabel = (m: string) => {
    if (lang === 'en') return m;
    // Simple conversion e.g. 2026-05 to Persian labels or standard Jalali mappings
    const parts = m.split('-');
    if (parts.length < 2) return m;
    const monthNum = parseInt(parts[1], 10);
    const monthsFa = [
      'ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 
      'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'
    ];
    return `${monthsFa[monthNum - 1]} ${parts[0]}`;
  };

  // Find max income to scale SVG chart columns
  const maxIncome = Math.max(...stats.monthlyIncomeChart.map(i => i.income), 100000000);

  return (
    <div className="space-y-8">
      
      {/* 1. Notifications & Danger Alerts Bar */}
      {unreadNotifications.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <Bell className="w-4 h-4 text-turquoise animate-bounce" />
            {t.notifications} ({unreadNotifications.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {unreadNotifications.slice(0, 4).map(notif => (
              <div 
                key={notif.id} 
                className={`p-4 rounded-xl border flex items-start gap-3 transition-all relative overflow-hidden ${
                  notif.type === 'overdue' 
                    ? 'bg-rose-950/25 border-rose-500/25 text-rose-200' 
                    : notif.type === 'ending_soon'
                    ? 'bg-amber-950/25 border-amber-500/25 text-amber-200'
                    : 'bg-turquoise-950/10 border-turquoise/20 text-turquoise'
                }`}
              >
                {notif.type === 'overdue' ? (
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                ) : notif.type === 'ending_soon' ? (
                  <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-turquoise shrink-0 mt-0.5" />
                )}
                
                <div className="flex-1 space-y-1">
                  <p className="text-xs leading-relaxed font-sans">
                    {lang === 'fa' ? notif.messageFa : notif.messageEn}
                  </p>
                  <span className="text-[10px] text-gray-500 block font-mono">{notif.date}</span>
                </div>

                <button
                  onClick={() => onMarkNotificationRead(notif.id)}
                  className="p-1 rounded-full hover:bg-black/40 text-gray-400 hover:text-white transition-colors cursor-pointer shrink-0 self-center"
                  title={t.markAsRead}
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. KPIs Dashboard Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        
        {/* Total Customers */}
        <div className="p-5 rounded-2xl glass-card flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-sans block">{t.statsTotalCustomers}</span>
            <span className="text-3xl font-black text-white mt-2 block font-display">{stats.totalCustomers}</span>
          </div>
          <div className="p-3 bg-gold/10 border border-gold/20 rounded-xl text-gold">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Active Contracts */}
        <div className="p-5 rounded-2xl glass-card flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-sans block">{t.statsActiveContracts}</span>
            <span className="text-3xl font-black text-white mt-2 block font-display">{stats.activeContracts}</span>
          </div>
          <div className="p-3 bg-turquoise/10 border border-turquoise/20 rounded-xl text-turquoise">
            <Smartphone className="w-6 h-6" />
          </div>
        </div>

        {/* Finished Contracts */}
        <div className="p-5 rounded-2xl glass-card flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-sans block">{t.statsFinishedContracts}</span>
            <span className="text-3xl font-black text-white mt-2 block font-display">{stats.finishedContracts}</span>
          </div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>

        {/* Total Outstanding debt */}
        <div className="p-5 rounded-2xl glass-card lg:col-span-1 flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-sans block">{t.statsOutstanding}</span>
            <span className="text-xl font-bold text-gold mt-2 block font-mono">
              {formatCurrency(stats.totalOutstandingBalance, lang)}
            </span>
          </div>
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-400">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Overdue Count */}
        <div className={`p-5 rounded-2xl glass-card flex items-center justify-between ${stats.overdueCount > 0 ? 'border-rose-500/40 bg-rose-950/10' : ''}`}>
          <div>
            <span className="text-xs text-gray-400 font-sans block">{t.statsOverdueCount}</span>
            <span className={`text-3xl font-black mt-2 block font-display ${stats.overdueCount > 0 ? 'text-rose-400' : 'text-white'}`}>
              {stats.overdueCount}
            </span>
          </div>
          <div className={`p-3 rounded-xl border ${stats.overdueCount > 0 ? 'bg-rose-500/25 border-rose-500/50 text-rose-400' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* 3. Graphical Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Monthly Income Chart Column */}
        <div className="p-6 rounded-2xl glass-card lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center border-b border-gray-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gold" />
              {t.chartIncomeTitle}
            </h3>
            <span className="text-xs text-turquoise font-semibold bg-turquoise/10 px-2.5 py-0.5 rounded-full">
              {lang === 'fa' ? 'سیر تکاملی واقعی' : 'Verified Income'}
            </span>
          </div>

          {/* SVG Custom Responsive Bar Chart */}
          <div className="h-64 flex items-end justify-between gap-4 pt-6 px-2">
            {stats.monthlyIncomeChart.map((data, idx) => {
              const heightPercent = Math.max(10, Math.round((data.income / maxIncome) * 100));
              return (
                <div key={idx} className="flex-1 flex flex-col items-center h-full group relative">
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full mb-2 bg-black border border-gold/40 text-[10px] text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 font-mono shadow-xl text-center">
                    <p className="text-gold font-bold">{formatMonthLabel(data.month)}</p>
                    <p className="font-semibold text-gray-300 mt-0.5">{formatCurrency(data.income, lang)}</p>
                  </div>
                  
                  {/* Dynamic Column bar with gradients */}
                  <div className="w-full bg-gray-900 rounded-t-lg overflow-hidden flex items-end h-full">
                    <div 
                      style={{ height: `${heightPercent}%` }}
                      className="w-full bg-gradient-to-t from-gold/40 to-turquoise rounded-t-md group-hover:to-gold transition-all duration-500 cursor-pointer"
                    ></div>
                  </div>

                  {/* Date label */}
                  <span className="text-[10px] text-gray-500 mt-2 font-mono whitespace-nowrap">
                    {formatMonthLabel(data.month)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Collection Target Concentric rate circular and key indicators */}
        <div className="p-6 rounded-2xl glass-card flex flex-col justify-between">
          <div className="flex justify-between items-center border-b border-gray-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-turquoise" />
              {t.chartRateTitle}
            </h3>
          </div>

          <div className="py-6 flex flex-col items-center justify-center space-y-4">
            
            {/* Circle concentric graphic */}
            <div className="relative w-40 h-40 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle 
                  cx="50" 
                  cy="50" 
                  r="40" 
                  stroke="rgba(212,175,55,0.08)" 
                  strokeWidth="8" 
                  fill="transparent" 
                />
                <circle 
                  cx="50" 
                  cy="50" 
                  r="40" 
                  stroke="#3AA6A6" 
                  strokeWidth="8" 
                  fill="transparent" 
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (251.2 * stats.collectionRate) / 100}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-3xl font-black text-white font-display block">
                  {stats.collectionRate}%
                </span>
                <span className="text-[10px] text-gray-400 block uppercase tracking-wider">{t.statsCollectionRate}</span>
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center leading-relaxed">
              {lang === 'fa' 
                ? 'بیانگر میزان تعهد اقساط پرداخت شده نسبت به معوقات زنده' 
                : 'Ratio of successfully collected amortization units on master schedule.'}
            </p>
          </div>

          <div className="p-3 bg-black/40 rounded-xl border border-gray-800 text-center font-mono text-xs text-turquoise flex items-center justify-center gap-2">
            <Check className="w-4 h-4" />
            <span>VIP COLLECT RATE SECURED</span>
          </div>
        </div>

      </div>

      {/* 4. Live Activity logs */}
      <div className="p-6 rounded-2xl glass-card space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-gray-800 pb-3">
          <Clock className="w-4 h-4 text-gold" />
          {t.recentActivity}
        </h3>

        <div className="divide-y divide-gray-900">
          {stats.recentActivity.map((activity) => (
            <div key={activity.id} className="py-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg mt-0.5 shrink-0 ${
                  activity.type === 'contract_created'
                    ? 'bg-gold/10 text-gold'
                    : activity.type === 'payment_received'
                    ? 'bg-turquoise/10 text-turquoise'
                    : activity.type === 'contract_deleted'
                    ? 'bg-rose-500/10 text-rose-400'
                    : 'bg-blue-500/15 text-blue-400'
                }`}>
                  {activity.type === 'payment_received' ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : activity.type === 'customer_created' ? (
                    <Users className="w-4 h-4" />
                  ) : (
                    <Smartphone className="w-4 h-4" />
                  )}
                </div>
                
                <div>
                  <h4 className="text-xs font-bold text-gray-200">
                    {lang === 'fa' ? activity.titleFa : activity.titleEn}
                  </h4>
                  <p className="text-xs text-gray-400 font-sans mt-0.5">
                    {lang === 'fa' ? activity.detailsFa : activity.detailsEn}
                  </p>
                </div>
              </div>

              <span className="text-[10px] text-gray-500 md:text-right font-mono self-end md:self-center">
                {new Date(activity.timestamp).toLocaleTimeString(lang === 'fa' ? 'fa-IR' : 'en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
