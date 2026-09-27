import React from 'react';
import { useTranslation } from '../../lib/i18n';
import { formatPersianDate } from '../../lib/dateUtils';
import { StatusBadge, StatusTone } from './StatusBadge';
import { cn } from './Button';

export interface TimelineItemProps {
  id: string;
  typeLabel: string;
  title: string;
  amount?: number | null;
  party?: string;
  dateTime?: string;
  userName?: string;
  status?: string;
  statusTone?: StatusTone;
  statusLabel?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
}

export interface TimelineProps {
  items: TimelineItemProps[];
  emptyMessage?: string;
  className?: string;
}

export const Timeline: React.FC<TimelineProps> = ({ items, emptyMessage, className }) => {
  const { t, isRtl } = useTranslation();

  if (!items.length) {
    return <p className="text-text-muted text-sm py-6 text-center">{emptyMessage || t('sim.financial.empty')}</p>;
  }

  return (
    <ol className={cn('relative border-inline-start border-border-subtle space-y-4', className)}>
      {items.map((item) => (
        <li key={item.id} className="ps-5 relative">
          <span
            className="absolute inset-inline-start-0 top-1.5 h-2.5 w-2.5 rounded-full bg-primary -translate-x-1/2 rtl:translate-x-1/2"
            aria-hidden
          />
          <div className="flex flex-col gap-0.5">
            <button
              onClick={item.onClick}
              className={cn(
                'text-sm font-semibold text-text-primary hover:text-primary transition-colors text-start',
                item.onClick ? 'cursor-pointer' : 'cursor-default'
              )}
            >
              {item.icon} {item.title}
            </button>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
              {item.dateTime && <span>{formatPersianDate(item.dateTime)}</span>}
              {item.party && <span>• {item.party}</span>}
              {item.userName && <span>• {item.userName}</span>}
              {item.status && (
                <StatusBadge
                  status={item.status}
                  tone={item.statusTone}
                  labelFallback={item.statusLabel}
                  showDot={false}
                />
              )}
            </div>
            {item.amount != null && (
              <span className="text-sm font-bold text-text-primary tabular-nums">{item.amount.toLocaleString(isRtl ? 'fa-IR' : 'en-US')}</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
};