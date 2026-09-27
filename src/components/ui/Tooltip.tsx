import React from 'react';
import { cn } from './Button';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, side = 'top', className }) => {
  return (
    <span className={cn('relative inline-flex group/tooltip', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface-elevated px-2 py-1 text-xs text-text-primary border border-border-subtle shadow-card opacity-0 transition-opacity group-hover/tooltip:opacity-100',
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
        )}
        aria-hidden
      >
        {content}
      </span>
    </span>
  );
};