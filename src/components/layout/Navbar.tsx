import React, { useState } from 'react';
import { User, Notification } from '../../types';
import {
  Search, Bell, Plus, PhoneCall, CheckSquare, Users, CreditCard,
  Wrench, Smartphone, FileText, Menu, Moon, Sun, Shield
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useTranslation } from '../../lib/i18n';

export interface NavbarProps {
  currentUser: User;
  notifications: Notification[];
  onOpenSearch: () => void;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
  onOpenQuickAction: (actionType: string) => void;
  onToggleSidebar: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  notifications = [],
  onOpenSearch,
  onOpenNotifications,
  onOpenProfile,
  onOpenQuickAction,
  onToggleSidebar,
  isDarkMode,
  onToggleDarkMode,
}) => {
  const { t, isRtl, language, setLanguage } = useTranslation();
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const unreadCount = (notifications || []).filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-30 w-full bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-primary/80 px-3 sm:px-6 py-2.5 flex items-center justify-between shadow-xs">
      {/* Right side: Mobile Menu + Logo / App Title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="lg:hidden p-2 text-muted hover:text-slate-900 dark:hover:text-slate-100 hover:bg-surface-subtle dark:hover:bg-slate-800/60 rounded-xl transition-colors"
          aria-label={t('common.filter')}
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 select-none">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-indigo-600 to-purple-700 p-0.5 shadow-xs flex items-center justify-center">
            <span className="font-extrabold text-white text-xs tracking-wider font-mono">MM</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-base sm:text-lg tracking-tight text-slate-900 dark:text-white">
                MMBA
              </span>
              <span className="hidden sm:inline-block text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-primary-light dark:bg-primary/15 text-primary border border-primary font-semibold">
                v4.0 OS
              </span>
            </div>
            <p className="hidden md:block text-[10px] text-muted font-medium">
              {t('header.tagline')}
            </p>
          </div>
        </div>
      </div>

      {/* Center: Global Search Trigger Button */}
      <div className="flex-1 max-w-md mx-2 sm:mx-6">
        <button
          type="button"
          onClick={onOpenSearch}
          className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-surface-subtle/70 border border-primary/90 text-muted hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 transition-all text-xs group"
        >
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted group-hover:text-primary dark:group-hover:text-indigo-400 transition-colors" />
            <span className="truncate">{t('ui.quickSearch')}</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-secondary border border-slate-300 dark:border-border-subtle">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Left side: Quick Action + Notifications + Dark Mode + Profile */}
      <div className="flex items-center gap-1.5 sm:gap-2.5">
        {/* Quick Action Dropdown */}
        <div className="relative">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowQuickMenu(!showQuickMenu)}
            leftIcon={<Plus className="w-4 h-4" />}
            className="hidden sm:inline-flex shadow-indigo-500/20"
          >
            {t('common.quickAction')}
          </Button>

          {showQuickMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowQuickMenu(false)}
              />
              <div className={`absolute ${isRtl ? 'left-0' : 'right-0'} mt-2 w-56 rounded-2xl bg-surface border border-primary text-primary shadow-2xl p-1.5 z-50 animate-blur-fade-up`}>
                <div className="p-2 text-[11px] font-bold text-muted border-b border-slate-100 dark:border-border-subtle text-start">
                  {t('header.quickCreate')}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickMenu(false);
                    onOpenQuickAction('CALL');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-secondary dark:text-slate-200 hover:bg-surface-subtle dark:hover:bg-slate-800/80 rounded-xl transition-colors text-start"
                >
                  <PhoneCall className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span>{t('header.logCall')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowQuickMenu(false);
                    onOpenQuickAction('TASK');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-secondary dark:text-slate-200 hover:bg-surface-subtle dark:hover:bg-slate-800/80 rounded-xl transition-colors text-start"
                >
                  <CheckSquare className="w-4 h-4 text-success shrink-0" />
                  <span>{t('header.newTask')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowQuickMenu(false);
                    onOpenQuickAction('CUSTOMER');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-secondary dark:text-slate-200 hover:bg-surface-subtle dark:hover:bg-slate-800/80 rounded-xl transition-colors text-start"
                >
                  <Users className="w-4 h-4 text-primary shrink-0" />
                  <span>{t('header.newCustomer')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowQuickMenu(false);
                    onOpenQuickAction('PAYMENT');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-secondary dark:text-slate-200 hover:bg-surface-subtle dark:hover:bg-slate-800/80 rounded-xl transition-colors text-start"
                >
                  <CreditCard className="w-4 h-4 text-success shrink-0" />
                  <span>{t('header.newPayment')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowQuickMenu(false);
                    onOpenQuickAction('REPAIR');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-secondary dark:text-slate-200 hover:bg-surface-subtle dark:hover:bg-slate-800/80 rounded-xl transition-colors text-start"
                >
                  <Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>{t('repairs.newRepairBtn')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowQuickMenu(false);
                    onOpenQuickAction('SIM');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-secondary dark:text-slate-200 hover:bg-surface-subtle dark:hover:bg-slate-800/80 rounded-xl transition-colors text-start"
                >
                  <Smartphone className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                  <span>{t('sims.newSimBtn')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowQuickMenu(false);
                    onOpenQuickAction('CONTRACT');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-secondary dark:text-slate-200 hover:bg-surface-subtle dark:hover:bg-slate-800/80 rounded-xl transition-colors text-start"
                >
                  <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span>{t('contracts.newContractBtn')}</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Language Switch */}
        <div className="flex items-center rounded-xl bg-surface-subtle dark:bg-surface-subtle border border-primary p-0.5 font-bold text-[11px]">
          <button
            type="button"
            onClick={() => setLanguage('fa')}
            className={`px-2 py-1 rounded-lg transition-all ${
              language === 'fa' ? 'bg-primary text-white shadow-xs' : 'text-secondary hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            FA
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-2 py-1 rounded-lg transition-all ${
              language === 'en' ? 'bg-primary text-white shadow-xs' : 'text-secondary hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            EN
          </button>
        </div>

        {/* Dark/Light toggle */}
        <button
          type="button"
          onClick={onToggleDarkMode}
          className="p-2 text-muted hover:text-slate-900 dark:hover:text-slate-100 hover:bg-surface-subtle dark:hover:bg-slate-800/60 rounded-xl transition-colors"
          title={isDarkMode ? t('header.themeLight') : t('header.themeDark')}
        >
          {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-primary" />}
        </button>

        {/* Notifications Toggle */}
        <button
          type="button"
          onClick={onOpenNotifications}
          className="relative p-2 text-muted hover:text-slate-900 dark:hover:text-slate-100 hover:bg-surface-subtle dark:hover:bg-slate-800/60 rounded-xl transition-colors"
          title={t('common.info')}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-950 animate-pulse" />
          )}
        </button>

        {/* Profile Trigger */}
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex items-center gap-2 p-1 pl-2 sm:pl-3 rounded-xl bg-surface-subtle dark:bg-surface-subtle/60 hover:bg-slate-200 dark:hover:bg-slate-800/80 border border-primary transition-all text-start group"
        >
          <div className="relative w-7 h-7 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-border-subtle">
            <img
              src={currentUser.avatar || '/avatars/avatar-1.jpg'}
              alt={currentUser.name}
              className="w-full h-full object-cover"
            />
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-slate-950" />
          </div>
          <div className="hidden sm:block text-start">
            <span className="block text-xs font-semibold text-secondary dark:text-slate-200 group-hover:text-primary dark:group-hover:text-indigo-300 truncate max-w-[100px]">
              {currentUser.name}
            </span>
            <span className="block text-[10px] text-muted truncate max-w-[100px]">
              {currentUser.role}
            </span>
          </div>
        </button>
      </div>
    </header>
  );
};
