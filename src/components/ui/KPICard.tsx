import React from 'react';
import { cn } from './Button';

export interface KPICardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  className?: string;
}

export const KPICard: React.FC<KPICardProps> = ({ label, value, icon, trend, trendUp, className }) => {
  return (
    <div className={cn("rounded-3xl bg-[#17191F] border border-[#292D36] p-5 flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-[#A3A9B6] text-xs font-bold uppercase tracking-wider">{label}</span>
        <div className="text-[#4385FF] p-2 rounded-xl bg-[#090A0D] border border-[#292D36]">{icon}</div>
      </div>
      <div className="text-2xl font-black text-[#F4F6FA] tracking-tight">{value}</div>
      {trend && (
        <div className={cn("text-xs font-bold", trendUp ? "text-[#25C5A5]" : "text-[#F06470]")}>
          {trend}
        </div>
      )}
    </div>
  );
};
