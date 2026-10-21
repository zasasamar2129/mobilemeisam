import React, { useMemo } from 'react';
import {
  Customer, Call, Task, Payment, CheckItem, Contract, SimCard, RepairTicket, VoiceNote
} from '../../types';
import {
  DollarSign, Users, Smartphone, Wrench, CreditCard, PieChart, BarChart3, TrendingUp, ArrowUpRight, Zap, CheckSquare
} from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { KPICard } from '../ui/KPICard';

export interface DashboardOverviewProps {
  customers: Customer[];
  calls: Call[];
  voiceNotes?: VoiceNote[];
  tasks: Task[];
  payments: Payment[];
  checks: CheckItem[];
  contracts: Contract[];
  sims: SimCard[];
  repairs: RepairTicket[];
  onNavigate: (tab: string) => void;
  onSelectCustomer: (customerId: string) => void;
  onQuickCall: () => void;
  onQuickVoiceNote?: () => void;
  onQuickTask: () => void;
  onQuickCustomer: () => void;
  onQuickPayment: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  customers = [],
  payments = [],
  sims = [],
  repairs = [],
  contracts = [],
  tasks = [],
  onNavigate,
}) => {
  const { t, formatNumber, formatCurrency } = useTranslation();

  // Metrics
  const totalRevenue = useMemo(() => (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0), [payments]);
  const activeCustomersCount = useMemo(() => (customers || []).filter((c) => c.status === 'ACTIVE' || !c.status).length, [customers]);
  const availableSimCount = useMemo(() => (sims || []).filter((s) => s.status === 'AVAILABLE').length, [sims]);
  const activeRepairsCount = useMemo(() => (repairs || []).filter((r) => r.status === 'RECEIVED' || r.status === 'IN_PROGRESS' || r.status === 'DIAGNOSING').length, [repairs]);
  const activeTasksCount = useMemo(() => (tasks || []).filter((t) => t.status !== 'COMPLETED').length, [tasks]);

  return (
    <div className="p-6 space-y-6 bg-[#090A0D] min-h-screen text-[#F4F6FA]">
      {/* 1. KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label={t('dashboard.totalRevenue')} value={formatCurrency(totalRevenue)} icon={<DollarSign className="w-5 h-5" />} trend="+12.5%" trendUp={true} />
        <KPICard label={t('dashboard.activeCustomers')} value={formatNumber(activeCustomersCount)} icon={<Users className="w-5 h-5" />} trend="+5.2%" trendUp={true} />
        <KPICard label={t('dashboard.simsInStock')} value={formatNumber(availableSimCount)} icon={<Smartphone className="w-5 h-5" />} trend="-2.1%" trendUp={false} />
        <KPICard label="Active Tasks" value={formatNumber(activeTasksCount)} icon={<CheckSquare className="w-5 h-5" />} />
      </div>

      {/* 2. Main Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Col (8) */}
        <div className="col-span-8 space-y-6">
          {/* Revenue Stream */}
          <div className="rounded-3xl bg-[#17191F] border border-[#292D36] p-6 h-80">
            <h3 className="text-[#F4F6FA] font-bold mb-4">Revenue Stream Summary</h3>
            <div className="h-56 flex items-center justify-center text-[#A3A9B6] border border-dashed border-[#292D36] rounded-xl">Line Chart Placeholder</div>
          </div>
          {/* Sales Tracker */}
          <div className="rounded-3xl bg-[#17191F] border border-[#292D36] p-6 h-64">
            <h3 className="text-[#F4F6FA] font-bold mb-4">Sales & Investor Tracker</h3>
            <div className="grid grid-cols-4 gap-4">
               {['Lead Investor', 'Proposals', 'Sales', 'Contract Sent'].map(item => (
                 <div key={item} className="bg-[#111318] p-4 rounded-xl border border-[#292D36]">
                   <p className="text-xs text-[#A3A9B6]">{item}</p>
                   <p className="text-lg font-bold mt-1">$0.00</p>
                 </div>
               ))}
            </div>
          </div>
        </div>

        {/* Right Col (4) */}
        <div className="col-span-4 space-y-6">
          {/* Company Balance */}
          <div className="rounded-3xl bg-[#17191F] border border-[#292D36] p-6 h-80">
            <h3 className="text-[#F4F6FA] font-bold mb-4">Company Balance</h3>
            <p className="text-3xl font-black">{formatCurrency(totalRevenue)}</p>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm text-[#A3A9B6]"><span>Investor Funding</span><span>$0</span></div>
              <div className="flex justify-between text-sm text-[#A3A9B6]"><span>Company Sales</span><span>{formatCurrency(totalRevenue)}</span></div>
            </div>
          </div>
          {/* Cashflow */}
          <div className="rounded-3xl bg-[#17191F] border border-[#292D36] p-6 h-64 flex flex-col items-center justify-center">
            <h3 className="text-[#F4F6FA] font-bold self-start mb-4">Cashflow Company</h3>
            <PieChart className="w-32 h-32 text-[#25C5A5]" />
          </div>
        </div>
      </div>
    </div>
  );
};
