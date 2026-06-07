/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Customer, Contract, Installment, Payment, ActivityLog, NotificationItem } from './types.ts';
import { getTranslation, formatCurrency, translations } from './translations.ts';
import CustomerStatement from './components/CustomerStatement.tsx';
import AdminDashboard from './components/AdminDashboard.tsx';
import CustomerManagement from './components/CustomerManagement.tsx';
import ContractManagement from './components/ContractManagement.tsx';
import PaymentRecording from './components/PaymentRecording.tsx';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Crown, 
  Search, 
  Smartphone, 
  CheckCircle, 
  Coins, 
  Clock, 
  AlertCircle, 
  Lock, 
  LogOut, 
  Globe, 
  FileSpreadsheet, 
  ArrowLeft, 
  User, 
  Activity, 
  Building,
  Menu,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon
} from 'lucide-react';

export default function App() {
  // Locale State - Persian default
  const [lang, setLang] = useState<'fa' | 'en'>(() => {
    const saved = localStorage.getItem('app_lang');
    return (saved === 'fa' || saved === 'en') ? saved : 'fa';
  });

  const t = translations[lang];

  // Language persist side-effect
  useEffect(() => {
    localStorage.setItem('app_lang', lang);
  }, [lang]);

  // Theme state - defaults to dark to preserve original premium look, but customizable
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('app_theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  useEffect(() => {
    localStorage.setItem('app_theme', theme);
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
  }, [theme]);

  // Auth States
  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem('admin_token'));
  const [adminUser, setAdminUser] = useState<any | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Login Form States
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Admin Workspace Tabs: 'dashboard' | 'customers' | 'contracts' | 'payments'
  const [adminTab, setAdminTab] = useState<'dashboard' | 'customers' | 'contracts' | 'payments'>('dashboard');

  // Customer Portal Search States
  const [portalPhoneSearch, setPortalPhoneSearch] = useState('');
  const [foundContracts, setFoundContracts] = useState<(Contract & { customer?: Customer; installments: Installment[]; payments: Payment[] })[]>([]);
  const [portalSearchLoading, setPortalSearchLoading] = useState(false);
  const [portalSearchDone, setPortalSearchDone] = useState(false);
  const [portalError, setPortalError] = useState('');

  // Selected Contract for Detailed Statement View
  const [selectedStatementContract, setSelectedStatementContract] = useState<any | null>(null);

  // Backend Data States (Admin sync)
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [stats, setStats] = useState<any | null>(null);
  const [dataError, setDataError] = useState('');

  // Boot strap authentication validation
  useEffect(() => {
    const bootAuth = async () => {
      if (adminToken) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
          });
          if (res.ok) {
            const data = await res.json();
            setAdminUser(data.user);
            await syncAdminData();
          } else {
            // Token stale
            handleLogout();
          }
        } catch {
          // Offline fallback or stale
          handleLogout();
        }
      }
      setAuthReady(true);
    };
    bootAuth();
  }, [adminToken]);

  // Sync data handler
  const syncAdminData = async () => {
    if (!adminToken) return;
    try {
      const headers = { 'Authorization': `Bearer ${adminToken}` };
      
      const [statsRes, custRes, contrRes, notifRes] = await Promise.all([
        fetch('/api/stats', { headers }),
        fetch('/api/customers', { headers }),
        fetch('/api/contracts', { headers }),
        fetch('/api/notifications', { headers })
      ]);

      if (statsRes.ok && custRes.ok && contrRes.ok && notifRes.ok) {
        setStats(await statsRes.json());
        setCustomers(await custRes.json());
        setContracts(await contrRes.json());
        setNotifications(await notifRes.json());
        setDataError('');
      } else {
        setDataError('Failed syncing workspace records.');
      }
    } catch {
      setDataError('Network failure connecting to Express service.');
    }
  };

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('admin_token', data.token);
        setAdminToken(data.token);
        setAdminUser(data.user);
        setUsername('');
        setPassword('');
        setShowLoginModal(false);
      } else {
        const err = await res.json();
        setLoginError(lang === 'fa' ? err.error : 'Invalid staff key match.');
      }
    } catch {
      setLoginError('Server connectivity failed.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setAdminToken(null);
    setAdminUser(null);
    setCustomers([]);
    setContracts([]);
    setStats(null);
    setSelectedStatementContract(null);
  };

  // Customer search portal execution
  const handleCustomerSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedVal = portalPhoneSearch.replace(/[^\d]/g, '');
    if (!sanitizedVal) return;

    if (sanitizedVal.length < 11) {
      setPortalError(
        lang === 'fa' 
          ? 'فرمت نامعتبر است: شماره تماس باید حداقل ۱۱ رقم باشد.' 
          : 'Invalid format: Phone number must be at least 11 digits.'
      );
      return;
    }

    setPortalSearchLoading(true);
    setPortalSearchDone(false);
    setPortalError('');
    setFoundContracts([]);

    try {
      const res = await fetch(`/api/customer/search?phone=${encodeURIComponent(sanitizedVal)}`);
      if (res.ok) {
        const data = await res.json();
        setFoundContracts(data);
        setPortalSearchDone(true);
      } else {
        const err = await res.json();
        setPortalError(err.error || 'Server error');
      }
    } catch {
      setPortalError('Search request timed out.');
    } finally {
      setPortalSearchLoading(false);
    }
  };

  // --- ADMIN ACTIONS PASS-THROUGH ---

  const handleAddCustomer = async (fullName: string, phoneNumber: string) => {
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ fullName, phoneNumber })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }

    await syncAdminData();
    return await res.json();
  };

  const handleEditCustomer = async (id: string, fullName: string, phoneNumber: string) => {
    const res = await fetch(`/api/customers/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ fullName, phoneNumber })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }

    await syncAdminData();
    return await res.json();
  };

  const handleAddContract = async (data: any) => {
    const res = await fetch('/api/contracts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }

    await syncAdminData();
    return await res.json();
  };

  const handleDeleteContract = async (id: string) => {
    const res = await fetch(`/api/contracts/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }

    await syncAdminData();
    return await res.json();
  };

  const handleRecordPayment = async (payData: any) => {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(payData)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }

    await syncAdminData();
    return await res.json();
  };

  const handleMarkNotificationRead = async (id: string) => {
    const res = await fetch(`/api/notifications/${id}/read`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (res.ok) {
      await syncAdminData();
    }
  };

  const handleDownloadReport = (type: 'customers' | 'contracts' | 'payments', format: 'csv' | 'excel') => {
    const url = `/api/reports/export?type=${type}&format=${format}&Authorization=Bearer ${adminToken}`;
    window.open(url, '_blank');
  };

  return (
    <div dir={lang === 'fa' ? 'rtl' : 'ltr'} className={`min-h-screen ${theme === 'light' ? 'bg-gray-100 text-gray-950' : 'bg-black text-gray-100'} flex flex-col font-sans transition-colors duration-300`}>
      
      {/* 1. BRAND NAVIGATION HEADER */}
      <nav className="border-b border-gold/15 bg-black bg-opacity-90 sticky top-0 z-40 max-w-7xl mx-auto w-full px-6 py-4 flex items-center justify-between no-print">
        
        {/* Brand logo & tag */}
        <div 
          onClick={() => {
            setSelectedStatementContract(null);
            setFoundContracts([]);
            setPortalSearchDone(false);
            setPortalPhoneSearch('');
          }}
          className="flex items-center gap-2.5 cursor-pointer hover:opacity-85 transition-opacity"
        >
          <div className="p-2 bg-gradient-to-br from-gold to-gold-hover rounded-xl border border-gold/20 flex items-center justify-center shadow-lg">
            <Crown className="w-5 h-5 text-black" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wider text-white font-display">{t.appName}</h1>
            <p className="text-[10px] text-turquoise tracking-widest uppercase font-semibold">{t.appSubName}</p>
          </div>
        </div>

        {/* Action utility row */}
        <div className="flex items-center gap-3 sm:gap-4">
          
          {/* Theme Toggle (Light / Dark Model switcher - fully visible) */}
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="p-2 px-3 rounded-lg bg-gray-950 border border-gold/20 text-xs font-semibold font-display text-gold flex items-center gap-1.5 hover:border-gold transition-all cursor-pointer shadow-md select-none"
            title={lang === 'fa' ? 'تغییر حالت روز و شب' : 'Toggle Day/Night Mode'}
          >
            {theme === 'light' ? (
              <>
                <Moon className="w-4 h-4 text-amber-500" />
                <span className="hidden sm:inline">{lang === 'fa' ? 'حالت شب' : 'Dark'}</span>
              </>
            ) : (
              <>
                <Sun className="w-4 h-4 text-sky-400 animate-spin-slow" />
                <span className="hidden sm:inline">{lang === 'fa' ? 'حالت روز' : 'Light'}</span>
              </>
            )}
          </button>
          
          {/* Language Switcher */}
          <button
            onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}
            className="p-2 px-3 rounded-lg bg-gray-950 border border-gold/20 text-xs font-semibold font-display text-gold flex items-center gap-1.5 hover:border-gold transition-all cursor-pointer shadow-md"
          >
            <Globe className="w-4 h-4 text-turquoise" />
            <span>{t.languageName}</span>
          </button>

          {/* Admin Command button */}
          {authReady && (
            adminUser ? (
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-gray-300 hidden md:block border-r border-gray-800 pr-3 mr-3 mt-0.5">
                  {lang === 'fa' ? 'خوش آمدید، میثم' : 'Welcome, Meisam'}
                </span>
                <button
                  onClick={handleLogout}
                  className="p-2 bg-rose-950/20 border border-rose-500/20 rounded-lg text-rose-400 hover:bg-rose-500 hover:text-white transition-all text-xs flex items-center gap-1.5 font-display cursor-pointer"
                  title={t.logout}
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">{t.logout}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="p-2 px-4 bg-gold text-black rounded-lg hover:bg-gold-hover text-xs font-black tracking-wider font-display flex items-center gap-1.5 cursor-pointer shadow-lg hover:shadow-gold/10"
              >
                <Lock className="w-3.5 h-3.5 text-black" />
                <span>{lang === 'fa' ? 'ورود همکاران' : 'Staff Area'}</span>
              </button>
            )
          )}

        </div>

      </nav>

      {/* 2. DYNAMIC WORKSPACE VIEW WRAPPER */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8">
        
        {/* --- ROUTE 1: DETAILED STATEMENT VIEW (ADMIN OR CLIENT DETAILED CHECK) --- */}
        {selectedStatementContract ? (
          <div>
            <CustomerStatement
              customer={selectedStatementContract.customer}
              contract={selectedStatementContract}
              lang={lang}
              onBack={() => setSelectedStatementContract(null)}
            />
          </div>
        ) : (
          
          /* --- ROUTE 2: MASTER ADMIN PORTAL CORE --- */
          adminUser ? (
            <div className="space-y-8">
              
              {/* Back to Customer view helper banner */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-xl bg-gray-950 border border-gray-900">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-turquoise" />
                  <span className="text-xs font-bold text-gray-200">
                    {lang === 'fa' ? 'مشغول کار بر روی پنل مدیریت هسستید' : 'You are working securely inside the main Command Center.'}
                  </span>
                </div>
                
                {/* Simulated excel report shortcuts */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleDownloadReport('customers', 'excel')}
                    className="p-1.5 px-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all text-xs flex items-center gap-1 font-mono tracking-tighter"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>XLS Customers</span>
                  </button>
                  <button
                    onClick={() => handleDownloadReport('contracts', 'excel')}
                    className="p-1.5 px-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all text-xs flex items-center gap-1 font-mono tracking-tighter"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>XLS Contracts</span>
                  </button>
                </div>
              </div>

              {/* Admin Portal Tab Menu Bar */}
              <div className="border-b border-gray-800 flex flex-wrap gap-2">
                <button
                  onClick={() => setAdminTab('dashboard')}
                  className={`px-5 py-3 text-sm font-semibold tracking-wide border-b-2 transition-all cursor-pointer ${
                    adminTab === 'dashboard' 
                      ? 'border-gold text-gold bg-gold/5' 
                      : 'border-transparent text-gray-400 hover:text-gray-100'
                  }`}
                >
                  {t.adminPortal}
                </button>
                <button
                  onClick={() => setAdminTab('customers')}
                  className={`px-5 py-3 text-sm font-semibold tracking-wide border-b-2 transition-all cursor-pointer ${
                    adminTab === 'customers' 
                      ? 'border-gold text-gold bg-gold/5' 
                      : 'border-transparent text-gray-400 hover:text-gray-100'
                  }`}
                >
                  {t.customersMenu}
                </button>
                <button
                  onClick={() => setAdminTab('contracts')}
                  className={`px-5 py-3 text-sm font-semibold tracking-wide border-b-2 transition-all cursor-pointer ${
                    adminTab === 'contracts' 
                      ? 'border-gold text-gold bg-gold/5' 
                      : 'border-transparent text-gray-400 hover:text-gray-100'
                  }`}
                >
                  {t.contractsMenu}
                </button>
                <button
                  onClick={() => setAdminTab('payments')}
                  className={`px-5 py-3 text-sm font-semibold tracking-wide border-b-2 transition-all cursor-pointer ${
                    adminTab === 'payments' 
                      ? 'border-gold text-gold bg-gold/5' 
                      : 'border-transparent text-gray-400 hover:text-gray-100'
                  }`}
                >
                  {t.paymentsMenu}
                </button>
              </div>

              {/* Data error placeholder */}
              {dataError && (
                <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-950/20 text-rose-400 text-xs">
                  {dataError}
                </div>
              )}

              {/* Tab views switcher */}
              <div>
                {adminTab === 'dashboard' && stats && (
                  <AdminDashboard
                    stats={stats}
                    notifications={notifications}
                    onMarkNotificationRead={handleMarkNotificationRead}
                    lang={lang}
                  />
                )}
                {adminTab === 'customers' && (
                  <CustomerManagement
                    customers={customers}
                    onAddCustomer={handleAddCustomer}
                    onEditCustomer={handleEditCustomer}
                    lang={lang}
                  />
                )}
                {adminTab === 'contracts' && (
                  <ContractManagement
                    contracts={contracts}
                    customers={customers}
                    onAddContract={handleAddContract}
                    onDeleteContract={handleDeleteContract}
                    onSelectContract={setSelectedStatementContract}
                    lang={lang}
                  />
                )}
                {adminTab === 'payments' && (
                  <PaymentRecording
                    contracts={contracts}
                    onRecordPayment={handleRecordPayment}
                    lang={lang}
                  />
                )}
              </div>

            </div>
          ) : (
            
            /* --- ROUTE 3: PUBLIC CLIENT HOMEPAGE & FIND STATUS --- */
            <div className="space-y-12 py-6">
              
              {/* Luxury Greeting Hero card */}
              <div className="text-center space-y-4 max-w-2xl mx-auto">
                <div className="inline-flex p-3 bg-gold/10 border border-gold/30 rounded-2xl text-gold mb-2 transform hover:rotate-12 transition-transform duration-350">
                  <Crown className="w-8 h-8" />
                </div>
                <h1 className="text-3xl md:text-5xl font-extrabold text-white font-display leading-tight tracking-tight">
                  {lang === 'fa' ? 'سرمایه‌گذاری طلایی روی شماره‌های خاص' : t.title}
                </h1>
                <p className="text-xs md:text-sm text-gray-400 leading-relaxed font-sans max-w-lg mx-auto">
                  {t.tagline}
                </p>
              </div>

              {/* SEARCH HUB PORTAL PANEL CONTAINER */}
              <div className="max-w-xl mx-auto rounded-3xl p-6 md:p-8 glass-card border-gold/25 relative overflow-hidden animate-gold-glow">
                
                {/* Absolute highlight design lines */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-gold/5 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-turquoise/5 rounded-full blur-3xl pointer-events-none"></div>

                <form onSubmit={handleCustomerSearch} className="space-y-4 relative z-10">
                  <h3 className="text-sm font-bold text-gold uppercase tracking-widest block text-center mb-1">
                    {t.customerPortal}
                  </h3>

                  <div className="relative">
                    <Search className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gold/60 ${lang === 'fa' ? 'right-4' : 'left-4'}`} />
                    <input
                      type="text"
                      dir="ltr"
                      value={portalPhoneSearch}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^\d]/g, '');
                        setPortalPhoneSearch(cleaned);
                      }}
                      placeholder={lang === 'fa' ? 'مثال: 09121112222' : 'Enter mobile phone number...'}
                      required
                      className={`w-full py-3.5 bg-black text-white font-mono tracking-widest text-center text-base rounded-xl border border-gold/25 focus:border-turquoise focus:ring-1 focus:ring-turquoise ${
                        lang === 'fa' ? 'pr-12' : 'pl-12'
                      }`}
                    />
                  </div>

                  {portalPhoneSearch.length > 0 && portalPhoneSearch.length < 11 && (
                    <p className="text-xs text-amber-500 font-medium text-center bg-amber-950/15 border border-amber-500/10 p-2.5 rounded-xl flex items-center justify-center gap-1.5 animate-pulse">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                      {lang === 'fa' 
                        ? 'فرمت نامعتبر: شماره تماس باید حداقل ۱۱ رقم باشد.' 
                        : 'Invalid format: Phone number must be at least 11 digits.'}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={portalSearchLoading}
                    className="w-full py-3.5 bg-gradient-to-r from-gold to-gold-hover hover:from-gold-hover hover:to-gold text-black rounded-xl font-bold font-display tracking-widest text-sm shadow-lg flex items-center justify-center gap-2 hover:shadow-gold/15 transition-all text-center cursor-pointer"
                  >
                    {portalSearchLoading ? t.searching : t.searchButton}
                  </button>
                </form>

                {/* SEARCH RESULTS LOADING SKELETON STATE */}
                <AnimatePresence>
                  {portalSearchLoading && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="mt-8 pt-6 border-t border-gray-800/80 space-y-4 relative z-10"
                    >
                      <div className="space-y-3">
                        <div className="h-4 bg-gray-800/40 rounded w-1/2 animate-pulse border border-gray-800/10"></div>
                        <div className="p-4 rounded-2xl bg-black bg-opacity-70 border border-gold/10 flex justify-between items-center relative overflow-hidden animate-pulse">
                          <div className="space-y-2 w-2/3">
                            <div className="h-3 bg-turquoise/20 rounded w-3/4"></div>
                            <div className="h-2 bg-gray-800 rounded w-1/2"></div>
                            <div className="h-2 bg-gray-800 rounded w-1/3"></div>
                          </div>
                          <div className="space-y-2 w-1/4 flex flex-col items-end">
                            <div className="h-3 bg-gray-800 rounded w-full"></div>
                            <div className="h-2 bg-gray-900 rounded w-2/3"></div>
                          </div>
                        </div>
                        <div className="p-4 rounded-2xl bg-black bg-opacity-70 border border-gold/10 flex justify-between items-center relative overflow-hidden animate-pulse">
                          <div className="space-y-2 w-2/3">
                            <div className="h-3 bg-gold/20 rounded w-3/4"></div>
                            <div className="h-2 bg-gray-800 rounded w-1/2"></div>
                            <div className="h-2 bg-gray-800 rounded w-1/3"></div>
                          </div>
                          <div className="space-y-2 w-1/4 flex flex-col items-end">
                            <div className="h-3 bg-gray-800 rounded w-full"></div>
                            <div className="h-2 bg-gray-900 rounded w-2/3"></div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* SEARCH RESULTS DISPLAY IN LUXURY CARDS */}
                <AnimatePresence>
                  {portalSearchDone && (
                    <motion.div 
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      className="mt-8 pt-6 border-t border-gray-800/80 space-y-4 relative z-10"
                    >
                      {foundContracts.length > 0 ? (
                        <div className="space-y-3">
                          <span className="text-xs text-gray-400 block pb-1 border-b border-gray-900">
                            {t.contractHistoryFor} <strong className="text-white font-mono">{portalPhoneSearch}</strong>
                          </span>
                          
                          {foundContracts.map(cnt => {
                            const unPaidInstallments = cnt.installments.filter(i => i.status !== 'paid');
                            const nextDue = unPaidInstallments.length > 0 ? unPaidInstallments[0] : null;
                            const hasOverdue = cnt.installments.some(i => i.status === 'overdue');

                            return (
                              <div 
                                key={cnt.id} 
                                onClick={() => setSelectedStatementContract(cnt)}
                                className={`p-4 rounded-2xl bg-black bg-opacity-70 border hover:border-gold cursor-pointer transition-all flex justify-between items-center group relative overflow-hidden ${
                                  hasOverdue ? 'border-rose-500/25' : 'border-gray-800/80'
                                }`}
                              >
                                {hasOverdue && (
                                  <div className="absolute top-0 right-0 bg-rose-600 text-[8px] text-white font-bold p-1 px-3 rounded-bl-lg font-sans">
                                    {lang === 'fa' ? 'اطلاعیه تاخیر غرامت' : 'Delinquency Flag'}
                                  </div>
                                )}
                                
                                <div className="space-y-1.5">
                                  <p className="text-xs text-turquoise font-mono font-bold tracking-widest">
                                    {cnt.simNumber}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-gray-400">Ref: {cnt.contractNumber}</span>
                                    <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${
                                      cnt.status === 'finished' 
                                        ? 'bg-turquoise/15 text-turquoise' 
                                        : 'bg-gold/15 text-gold'
                                    }`}>
                                      {cnt.status === 'finished' ? t.finished : t.active}
                                    </span>
                                  </div>
                                  
                                  {nextDue && (
                                    <p className="text-[10px] text-gray-500">
                                      {lang === 'fa' ? 'سررسید بعدی:' : 'Next Amortization:'} <strong className="text-gold font-mono">{nextDue.dueDate}</strong>
                                    </p>
                                  )}
                                </div>

                                <div className="text-right flex flex-col items-end gap-1.5">
                                  <span className="text-xs font-mono font-bold text-gray-300">
                                    {formatCurrency(cnt.remainingBalance, lang)}
                                  </span>
                                  <span className="text-[10px] text-gray-500 block">
                                    {lang === 'fa' ? 'مانده بدهی' : 'Balance'}
                                  </span>
                                  <div className="p-1 px-2.5 rounded bg-gold text-black font-display font-medium text-[10px] uppercase select-none opacity-0 group-hover:opacity-100 transition-opacity">
                                    {lang === 'fa' ? 'جزئیات' : 'Portal'}
                                  </div>
                                </div>

                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-rose-300 font-medium text-center p-4 bg-rose-950/15 border border-rose-500/10 rounded-xl">
                          {t.noContractsFound}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {portalError && (
                  <p className="text-xs text-rose-400 font-medium text-center p-3 bg-rose-950/20 border border-rose-500/10 rounded-xl mt-4">
                    {portalError}
                  </p>
                )}

              </div>

              {/* Exclusive features showcase under search */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto text-center">
                <div className="p-5 rounded-2xl glass-card space-y-2">
                  <div className="mx-auto w-10 h-10 rounded-xl bg-gold/10 border border-gold/25 flex items-center justify-center text-gold">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-gray-200">{lang === 'fa' ? 'خطوط اعتباری شماره گلد' : 'Gold SIM Lines'}</h4>
                  <p className="text-xs text-gray-400">{lang === 'fa' ? 'واگذاری سیم‌کارت همزمان با اتمام کامل فوند رسیب' : 'Title transfer processing synchronous down-to-zero.'}</p>
                </div>

                <div className="p-5 rounded-2xl glass-card space-y-2">
                  <div className="mx-auto w-10 h-10 rounded-xl bg-turquoise/10 border border-turquoise/25 flex items-center justify-center text-turquoise">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-gray-200">{lang === 'fa' ? 'محاسبه‌گر خودکار' : 'Dynamic Auto Audit'}</h4>
                  <p className="text-xs text-gray-400">{lang === 'fa' ? 'تناسب توزیع پرداختی مابین سررسیدهای قدیمی' : 'Algorithmic payment distribution matches delinquent terms first.'}</p>
                </div>

                <div className="p-5 rounded-2xl glass-card space-y-2">
                  <div className="mx-auto w-10 h-10 rounded-xl bg-gold/10 border border-gold/25 flex items-center justify-center text-gold">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-gray-200">{lang === 'fa' ? 'تراس مالی رسمی' : 'Financial Transparency'}</h4>
                  <p className="text-xs text-gray-400">{lang === 'fa' ? 'ارسال، بارگذاری و چاپ سریع فاکتور معتبر در مراجع دیجیتالی' : 'Certified document printing conforms instantly to local tax codes.'}</p>
                </div>
              </div>

            </div>
          )

        )}

      </main>

      {/* 3. BRAND MASTER FOOTER */}
      <footer className="border-t border-gold/15 bg-black py-8 mt-12 text-sm text-gray-500 no-print">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-right">
            <span className="text-white font-bold font-display">{t.appName}</span>
            <p className="text-xs text-gray-400 mt-1">{t.aboutUsFooter}</p>
          </div>
          <div className="text-center md:text-left text-xs space-y-1">
            <p className="text-gray-400">© 1405 - {new Date().getFullYear()} Mobile Meisam Inc.</p>
            <p className="font-mono text-gold-hover">{t.developedBy}</p>
          </div>
        </div>
      </footer>

      {/* 4. MODAL SCREEN: EXECUTIVE STAFF ACCESS LOGIN */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md p-6 md:p-8 rounded-3xl glass-card border-gold/40 space-y-6 relative animate-gold-glow bg-black">
            
            <button
              onClick={() => {
                setShowLoginModal(false);
                setLoginError('');
              }}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-black text-gray-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center space-y-2">
              <Crown className="w-8 h-8 text-gold mx-auto" />
              <h3 className="text-lg font-black text-white font-display uppercase tracking-widest">{t.loginTitle}</h3>
              <p className="text-xs text-gray-400">{t.loginSubtitle}</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 block">{t.username}</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                  className="w-full text-base p-2.5 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 block">{t.password}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full text-base p-2.5 font-mono"
                />
              </div>

              {loginError && (
                <p className="text-xs text-rose-400 bg-rose-950/20 p-2 rounded-lg border border-rose-500/10 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {loginError}
                </p>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3 bg-gold hover:bg-gold-hover text-black font-black tracking-wider text-sm rounded-xl transition-all cursor-pointer shadow-lg"
              >
                {loginLoading ? t.loggingIn : t.loginButton}
              </button>
            </form>

            <div className="text-center">
              <span className="text-[10px] text-gray-400 font-mono italic">
                {lang === 'fa' ? 'نام پیش‌فرض: admin | کلمه عبور: meisam123' : 'Default user: admin | pass: meisam123'}
              </span>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

// Inline fallback object to avoid import errors
const X = (props: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);
