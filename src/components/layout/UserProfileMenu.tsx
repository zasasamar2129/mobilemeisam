import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { User, UserRole } from '../../types';
import { storage } from '../../services/storage';
import { api } from '../../services/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Checkbox } from '../ui/Checkbox';
import { AvatarUploader } from '../ui/AvatarUploader';
import {
  User as UserIcon, Shield, Mail, Phone, Building2,
  Calendar, CheckCircle, RefreshCw, KeyRound, Sparkles, LogOut, Lock, Check, Globe
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import { isAdmin } from '../../lib/permissions';
import { useTranslation } from '../../lib/i18n';
import { formatPersianDate } from '../../lib/dateUtils';
import { cleanDigits } from '../../lib/numberUtils';

export interface UserProfileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  allUsers: User[];
  onUserChanged: (user: User) => void;
  onLogout: () => void;
  onLockSession?: () => void;
}

export const UserProfileMenu: React.FC<UserProfileMenuProps> = ({
  isOpen,
  onClose,
  currentUser,
  allUsers = [],
  onUserChanged,
  onLogout,
  onLockSession,
}) => {
  const { language, setLanguage, t, isRtl, formatNumber } = useTranslation();
  const { success, error: toastError } = useToast();
  const [activeTab, setActiveTab] = useState<'profile' | 'switch_user' | 'security'>('profile');
  const [autoLockMins, setAutoLockMins] = useState<number>(storage.getAutoLockMinutes());
  const userIsAdmin = isAdmin(currentUser);

  // Profile edit state
  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(currentUser.email || '');
  const [mobile, setMobile] = useState(currentUser.mobile || '');
  const [department, setDepartment] = useState(currentUser.department || '');
  const [avatar, setAvatar] = useState<string | undefined>(currentUser.avatar);

  // Sync state when currentUser changes or modal reopens
  useEffect(() => {
    setName(currentUser.name);
    setEmail(currentUser.email || '');
    setMobile(currentUser.mobile || '');
    setDepartment(currentUser.department || '');
    setAvatar(currentUser.avatar);
  }, [currentUser, isOpen]);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Switch User with Password prompt state
  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [switchPassword, setSwitchPassword] = useState('');
  const [switchError, setSwitchError] = useState<string | null>(null);

  // Reset demo modal state
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated: User = {
      ...currentUser,
      id: currentUser.id || (currentUser.username === 'admin' ? 'usr-admin' : currentUser.id),
      name: name.trim(),
      email: email.trim(),
      mobile: mobile.trim(),
      department: department.trim(),
      avatar: avatar,
    };
    storage.saveUser(updated);
    storage.setCurrentUser(updated);
    onUserChanged(updated);

    try {
      await api.updateProfile({
        userId: updated.id,
        name: updated.name,
        email: updated.email,
        mobile: updated.mobile,
        department: updated.department,
        avatar: updated.avatar,
        username: updated.username,
      });
    } catch (err) {
      console.warn('Profile direct API sync notice:', err);
    }

    success(t('common.success'));
    onClose();
  };

  const handleSelectUserToSwitch = (user: User) => {
    if (user.id === currentUser.id) {
      toastError(language === 'fa' ? 'این کاربر هم‌اکنون فعال است.' : 'This user is already active.');
      return;
    }
    setTargetUser(user);
    setSwitchPassword('');
    setSwitchError(null);
  };

  const handleConfirmSwitch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser) return;

    if (!switchPassword) {
      setSwitchError(language === 'fa' ? 'لطفاً کلمه عبور این کاربر را وارد فرمایید.' : 'Please enter password for this user.');
      return;
    }

    const isValid = storage.verifyUserPassword(targetUser.id, switchPassword);
    if (!isValid) {
      setSwitchError(language === 'fa' ? 'رمز عبور وارد شده برای این کاربر اشتباه است.' : 'Incorrect password for this user.');
      return;
    }

    storage.setCurrentUser(targetUser);
    onUserChanged(targetUser);
    success(language === 'fa' ? `با موفقیت به حساب کاربری ${targetUser.name} تغییر یافت.` : `Switched to user ${targetUser.name}.`);
    setTargetUser(null);
    setSwitchPassword('');
    setSwitchError(null);
    onClose();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentActual = currentUser.password || '123';
    if (currentPassword !== currentActual) {
      toastError(language === 'fa' ? 'کلمه عبور فعلی نادرست است' : 'Current password is incorrect');
      return;
    }
    if (!newPassword || newPassword.length < 3) {
      toastError(language === 'fa' ? 'کلمه عبور جدید باید حداقل ۳ کاراکتر باشد' : 'Password must be at least 3 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toastError(language === 'fa' ? 'تکرار کلمه عبور جدید با آن همخوانی ندارد' : 'Passwords do not match');
      return;
    }

    const updated: User = {
      ...currentUser,
      password: newPassword,
    };
    storage.saveUser(updated);
    storage.setCurrentUser(updated);
    onUserChanged(updated);

    try {
      await api.updatePassword({
        userId: currentUser.id,
        currentPassword,
        newPassword,
        username: currentUser.username,
      });
    } catch (err) {
      console.warn('Password direct API sync notice:', err);
    }

    success(language === 'fa' ? 'کلمه عبور با موفقیت تغییر یافت' : 'Password updated successfully');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const roleLabels: Record<string, { titleFa: string; titleEn: string; color: 'purple' | 'info' | 'warning' | 'success' | 'amber' | 'default' | 'rose' }> = {
    [UserRole.GOD]: { titleFa: 'مدیر کل مطلق (GOD)', titleEn: 'System Owner (GOD)', color: 'rose' },
    god: { titleFa: 'مدیر کل مطلق (GOD)', titleEn: 'System Owner (GOD)', color: 'rose' },
    [UserRole.OWNER]: { titleFa: 'مالک و مدیر ارشد', titleEn: 'Owner & Senior Director', color: 'purple' },
    [UserRole.SUPER_ADMIN]: { titleFa: 'مدیر ارشد سامانه', titleEn: 'Super Administrator', color: 'purple' },
    [UserRole.SUPERVISOR]: { titleFa: 'سرپرست عملیات', titleEn: 'Operations Supervisor', color: 'info' },
    [UserRole.ACCOUNTING_ADMIN]: { titleFa: 'مدیر مالی و حسابداری', titleEn: 'Accounting Director', color: 'warning' },
    [UserRole.FINANCE_MANAGER]: { titleFa: 'مدیر مالی و خزانه‌دار', titleEn: 'Finance Manager', color: 'warning' },
    [UserRole.SALES]: { titleFa: 'کارشناس فروش', titleEn: 'Sales Specialist', color: 'success' },
    [UserRole.SALES_AGENT]: { titleFa: 'کارشناس فروش و قرارداد', titleEn: 'Sales & Contracts', color: 'success' },
    [UserRole.STORE_OPERATIONS]: { titleFa: 'عملیات فروشگاه', titleEn: 'Store Operations', color: 'amber' },
    [UserRole.REPAIR_TECHNICIAN]: { titleFa: 'تکنسین تعمیرات', titleEn: 'Repair Technician', color: 'info' },
    [UserRole.TECHNICIAN]: { titleFa: 'تکنسین فنی', titleEn: 'Technical Specialist', color: 'info' },
    [UserRole.TECHNICAL]: { titleFa: 'کارشناس فنی و شبکه', titleEn: 'Network & Tech', color: 'default' },
    [UserRole.READ_ONLY]: { titleFa: 'کاربر فقط مشاهده', titleEn: 'Read Only Access', color: 'default' },
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="lg"
        title={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-indigo-500/40 bg-surface-subtle flex items-center justify-center shrink-0">
              {avatar ? (
                <img src={avatar} alt={name || currentUser.name} className="w-full h-full object-cover" />
              ) : currentUser.avatar ? (
                <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-5 h-5 text-indigo-400" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-primary">{currentUser.name}</h3>
              <p className="text-xs text-muted">@{currentUser.username}</p>
            </div>
          </div>
        }
        subtitle={
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={roleLabels[currentUser.role]?.color || 'default'} size="sm">
              {language === 'fa'
                ? roleLabels[currentUser.role]?.titleFa || currentUser.role
                : roleLabels[currentUser.role]?.titleEn || currentUser.role}
            </Badge>
            {currentUser.department && (
              <span className="text-[11px] text-muted">• {currentUser.department}</span>
            )}
          </div>
        }
      >
        {/* Top Tabs */}
        <div className="flex border-b border-primary mb-5 gap-3 sm:gap-4 text-xs font-semibold overflow-x-auto pb-0.5 no-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab('profile');
              setTargetUser(null);
            }}
            className={`pb-2.5 transition-colors relative whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'profile'
                ? 'text-primary font-bold'
                : 'text-muted hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>{t('profile.tabProfile')}</span>
            {activeTab === 'profile' && (
              <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary dark:bg-primary rounded-full" />
            )}
          </button>

          {userIsAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('switch_user')}
              className={`pb-2.5 transition-colors relative whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'switch_user'
                  ? 'text-primary font-bold'
                  : 'text-muted hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-500" />
              <span>{t('profile.tabSwitch')}</span>
              {activeTab === 'switch_user' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary dark:bg-primary rounded-full" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setActiveTab('security');
              setTargetUser(null);
            }}
            className={`pb-2.5 transition-colors relative whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'security'
                ? 'text-primary font-bold'
                : 'text-muted hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-emerald-500" />
            <span>{t('profile.tabSecurity')}</span>
            {activeTab === 'security' && (
              <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary dark:bg-primary rounded-full" />
            )}
          </button>
        </div>

        {/* Tab: Profile */}
        {activeTab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="space-y-4">
            {/* Avatar Upload Section */}
            <div className="space-y-1.5 pb-2">
              <label className="text-xs font-bold text-secondary block">
                {t('profile.avatarUpdate')}:
              </label>
              <AvatarUploader
                currentAvatar={avatar}
                userName={name || currentUser.name}
                onAvatarChange={(newAvatar) => setAvatar(newAvatar)}
                size="lg"
                showPresets={true}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label={t('profile.name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                rightIcon={<UserIcon className="w-4 h-4" />}
                isRequired
              />
              <Input
                label={t('profile.mobile')}
                value={mobile}
                onChange={(e) => setMobile(cleanDigits(e.target.value))}
                rightIcon={<Phone className="w-4 h-4" />}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label={t('profile.email')}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                rightIcon={<Mail className="w-4 h-4" />}
              />
              <Input
                label={t('profile.department')}
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                rightIcon={<Building2 className="w-4 h-4" />}
              />
            </div>

            {/* Language Preference in Profile */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-surface-subtle/60 border border-primary text-xs flex items-center justify-between">
              <span className="flex items-center gap-2 text-secondary font-semibold">
                <Globe className="w-4 h-4 text-indigo-500" />
                <span>{t('header.lang')}</span>
              </span>
              <div className="flex items-center rounded-lg bg-slate-200 dark:bg-slate-800 p-0.5 font-bold text-[11px]">
                <button
                  type="button"
                  onClick={() => setLanguage('fa')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    language === 'fa' ? 'bg-primary text-white shadow-xs' : 'text-secondary'
                  }`}
                >
                  فارسی
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    language === 'en' ? 'bg-primary text-white shadow-xs' : 'text-secondary'
                  }`}
                >
                  English
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-primary">
              <Button
                variant="danger"
                size="sm"
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                leftIcon={<LogOut className="w-4 h-4" />}
              >
                {t('profile.logout')}
              </Button>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" type="button" onClick={onClose}>
                  {t('common.cancel')}
                </Button>
                <Button variant="primary" size="sm" type="submit" leftIcon={<CheckCircle className="w-4 h-4" />}>
                  {t('common.save')}
                </Button>
              </div>
            </div>
          </form>
        )}

        {/* Tab: Switch User */}
        {activeTab === 'switch_user' && (
          <div className="space-y-4">
            {!targetUser ? (
              <>
                <p className="text-xs text-muted leading-relaxed">
                  {t('profile.switchPrompt')}
                </p>

                <div className="grid grid-cols-1 gap-2 max-h-[320px] overflow-y-auto pr-1">
                  {(allUsers || []).map((u) => {
                    const isCurrent = u.id === currentUser.id;
                    return (
                      <div
                        key={u.id}
                        onClick={() => handleSelectUserToSwitch(u)}
                        className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                          isCurrent
                            ? 'bg-primary-light dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-500/50 shadow-xs opacity-80'
                            : 'bg-surface/70 border-primary hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500/40'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl overflow-hidden bg-gradient-to-tr from-indigo-600 to-sky-500 border border-slate-300 dark:border-border-subtle shrink-0 flex items-center justify-center text-white text-xs font-bold shadow-xs">
                            {u.avatar ? (
                              <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                            ) : (
                              u.name.charAt(0)
                            )}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-secondary dark:text-slate-200">{u.name}</h4>
                            <p className="text-[11px] text-muted font-mono">
                              @{u.username} {u.department ? `• ${u.department}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant={roleLabels[u.role]?.color || 'default'} size="sm">
                            {language === 'fa'
                              ? roleLabels[u.role]?.titleFa || u.role
                              : roleLabels[u.role]?.titleEn || u.role}
                          </Badge>
                          {isCurrent ? (
                            <span className="text-xs text-primary font-bold px-2 py-0.5 rounded-lg bg-primary-light dark:bg-primary/10">
                              {t('common.active')}
                            </span>
                          ) : (
                            <span className="text-xs text-muted dark:text-muted">
                              &rarr;
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              /* Password prompt */
              <form onSubmit={handleConfirmSwitch} className="p-4 rounded-2xl bg-slate-50 dark:bg-surface-subtle border border-indigo-300 dark:border-indigo-500/40 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-primary">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl overflow-hidden bg-gradient-to-tr from-indigo-600 to-sky-500 border border-indigo-500/50 shrink-0 flex items-center justify-center text-white text-base font-bold shadow-md">
                      {targetUser.avatar ? (
                        <img src={targetUser.avatar} alt={targetUser.name} className="w-full h-full object-cover" />
                      ) : (
                        targetUser.name.charAt(0)
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-primary">{targetUser.name}</h3>
                      <p className="text-xs text-muted font-mono">@{targetUser.username}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTargetUser(null)}
                    className="text-xs text-secondary hover:text-slate-900 dark:hover:text-slate-200 px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800"
                  >
                    {t('common.cancel')}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-secondary dark:text-slate-200 mb-1.5">
                    {language === 'fa' ? `رمز عبور کاربر ${targetUser.name}:` : `Enter password for ${targetUser.name}:`}
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      placeholder="123"
                      value={switchPassword}
                      onChange={(e) => {
                        setSwitchPassword(e.target.value);
                        setSwitchError(null);
                      }}
                      autoFocus
                      className="w-full h-11 px-3.5 pr-10 rounded-xl bg-surface border border-slate-300 dark:border-border-subtle text-sm text-primary placeholder-slate-400 focus:outline-none focus:border-primary font-mono"
                    />
                    <div className="absolute right-3.5 top-3 text-muted pointer-events-none">
                      <Lock className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {switchError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-danger text-xs">
                    {switchError}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[11px] text-muted">Default: 123</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" type="button" onClick={() => setTargetUser(null)}>
                      {t('common.cancel')}
                    </Button>
                    <Button variant="primary" size="sm" type="submit" leftIcon={<KeyRound className="w-4 h-4" />}>
                      {t('profile.switchUser')}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Tab: Security & Password */}
        {activeTab === 'security' && (
          <div className="space-y-5 text-xs">
            {/* Change Password Form */}
            <form onSubmit={handleChangePassword} className="p-4 rounded-2xl bg-slate-50 dark:bg-surface-subtle/80 border border-primary space-y-3.5">
              <h4 className="text-sm font-bold text-secondary dark:text-slate-200 flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-500" />
                <span>{t('profile.changePassword')}</span>
              </h4>

              <div>
                <label className="block text-secondary text-[11px] mb-1">{t('profile.currentPassword')}:</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="***"
                  className="w-full h-10 px-3 rounded-xl bg-surface border border-slate-300 dark:border-border-subtle text-xs text-primary font-mono focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-secondary text-[11px] mb-1">{t('profile.newPassword')}:</label>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="***"
                    className="w-full h-10 px-3 rounded-xl bg-surface border border-slate-300 dark:border-border-subtle text-xs text-primary font-mono focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-secondary text-[11px] mb-1">{t('profile.confirmPassword')}:</label>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="***"
                    className="w-full h-10 px-3 rounded-xl bg-surface border border-slate-300 dark:border-border-subtle text-xs text-primary font-mono focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <Checkbox
                  checked={showPass}
                  onChange={(e) => setShowPass(e.target.checked)}
                  label={language === 'fa' ? 'نمایش کلمات عبور' : 'Show passwords'}
                  colorScheme="indigo"
                  size="sm"
                />

                <Button variant="primary" size="sm" type="submit" leftIcon={<KeyRound className="w-3.5 h-3.5" />}>
                  {t('profile.changePassword')}
                </Button>
              </div>
            </form>

            {/* Quick Session Lock & Privacy */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-50 dark:from-rose-950/20 via-slate-50 dark:via-slate-900 to-indigo-50 dark:to-indigo-950/20 border border-primary space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-primary">{t('profile.lockSession')}</h4>
                    <p className="text-[10px] text-muted">
                      {language === 'fa' ? 'هنگام ترک سیستم بدون خروج، صفحه را قفل کنید.' : 'Lock workspace screen temporarily.'}
                    </p>
                  </div>
                </div>

                {onLockSession && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onClose();
                      onLockSession();
                    }}
                    className="border-rose-500/30 hover:bg-rose-500/10 text-rose-600 dark:text-rose-300"
                    leftIcon={<Lock className="w-3.5 h-3.5 text-rose-500" />}
                  >
                    {t('profile.lockSession')}
                  </Button>
                )}
              </div>

              {/* Auto Lock Timer Setting */}
              <div className="pt-2 border-t border-primary/80 flex items-center justify-between">
                <span className="text-[11px] text-secondary">{t('profile.autoLock')}:</span>
                <select
                  value={autoLockMins}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setAutoLockMins(val);
                    storage.setAutoLockMinutes(val);
                    success(val > 0 ? `${t('profile.autoLock')} (${val})` : t('common.inactive'));
                  }}
                  className="h-8 px-2.5 rounded-lg bg-surface border border-slate-300 dark:border-border-subtle text-[11px] text-secondary dark:text-slate-200 focus:outline-none focus:border-primary"
                >
                  <option value={0}>{language === 'fa' ? 'غیرفعال' : 'Disabled'}</option>
                  <option value={2}>{language === 'fa' ? 'پس از ۲ دقیقه' : '2 minutes'}</option>
                  <option value={5}>{language === 'fa' ? 'پس از ۵ دقیقه' : '5 minutes'}</option>
                  <option value={15}>{language === 'fa' ? 'پس از ۱۵ دقیقه' : '15 minutes'}</option>
                  <option value={30}>{language === 'fa' ? 'پس از ۳۰ دقیقه' : '30 minutes'}</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                leftIcon={<LogOut className="w-4 h-4" />}
              >
                {t('profile.logout')}
              </Button>

              {userIsAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  onClick={() => setShowResetConfirm(true)}
                >
                  {language === 'fa' ? 'بازنشانی داده‌های دمو' : 'Reset Demo Data'}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Clean Demo Reset Confirmation Modal */}
      {showResetConfirm && (
        <Modal
          isOpen={showResetConfirm}
          onClose={() => setShowResetConfirm(false)}
          maxWidth="sm"
          title={language === 'fa' ? 'بازنشانی داده‌های نمونه' : 'Reset Demo Data'}
        >
          <div className="space-y-4 text-xs">
            <p className="text-secondary dark:text-slate-300 leading-relaxed">
              {language === 'fa'
                ? 'آیا مطمئن هستید که می‌خواهید داده‌های سامانه را به داده‌های نمونه اولیه بازنشانی کنید؟'
                : 'Are you sure you want to reset the system to initial demo sample data?'}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowResetConfirm(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  storage.resetToSeedData();
                  window.location.reload();
                }}
              >
                {t('common.confirm')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
