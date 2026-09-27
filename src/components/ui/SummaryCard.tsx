import React from 'react';
import { cn } from './Button';

export interface SummaryCardProps {
  label: string;
  value: string | number;
  subLabel?: string;
  tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'primary';
  isIncomplete?: boolean;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, subLabel, tone = 'neutral', isIncomplete }) => {
  const toneClasses = {
    neutral: 'text-text-secondary',
    success: 'text-success',
    danger: 'text-danger',
    warning: 'text-warning',
    primary: 'text-primary',
  };

  return (
    <div className="app-card p-4 flex flex-col gap-1">
      <span className="text-text-muted text-xs font-medium uppercase tracking-wider">{label}</span>
      {isIncomplete ? (
        <span className="text-sm px-2 py-1 bg-surface-subtle text-text-muted rounded-md border border-border-subtle italic">Incomplete Data / N/A</span>
      ) : (
        <span className={`text-xl font-bold ${toneClasses[tone]}`}>{value}</span>
      )}
      {subLabel && <span className="text-text-muted text-xs">{subLabel}</span>}
    </div>
  );
};