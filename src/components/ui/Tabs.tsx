import React from 'react';
import { useTranslation } from '../../lib/i18n';
import { cn } from './Button';

export interface TabDef {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabDef[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeId, onChange, className }) => {
  const { isRtl } = useTranslation();
  return (
    <div
      role="tablist"
      className={cn('inline-flex items-center gap-1 p-1 bg-surface-subtle rounded-xl border border-border-subtle w-full sm:w-auto', className)}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeId === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            activeId === tab.id
              ? 'bg-surface text-text-primary shadow-card font-semibold'
              : 'text-text-muted hover:text-text-secondary'
          )}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
};