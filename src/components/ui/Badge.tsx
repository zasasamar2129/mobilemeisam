import React from 'react';
import { cn } from './Button';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | 'default'
    | 'success'
    | 'warning'
    | 'danger'
    | 'info'
    | 'purple'
    | 'amber'
    | 'outline';
  size?: 'sm' | 'md';
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'default',
  size = 'md',
  dot = false,
  children,
  ...props
}) => {
  const variants = {
    default: 'bg-surface-subtle text-secondary border-primary/80',
    success: 'bg-emerald-50 dark:bg-success/10 text-success dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25',
    warning: 'bg-amber-50 dark:bg-amber-500/10 text-warning dark:text-amber-300 border-amber-200 dark:border-amber-500/25',
    danger: 'bg-rose-50 dark:bg-danger/10 text-danger dark:text-rose-400 border-rose-200 dark:border-rose-500/25',
    info: 'bg-sky-50 dark:bg-info/10 text-info dark:text-sky-400 border-sky-200 dark:border-sky-500/25',
    purple: 'bg-primary-light dark:bg-primary/10 text-primary border-indigo-200 dark:border-indigo-500/25',
    amber: 'bg-amber-50 dark:bg-amber-500/15 text-warning dark:text-amber-400 border-amber-200 dark:border-amber-400/30',
    outline: 'bg-transparent text-secondary border-slate-300 dark:border-slate-600',
  };

  const dotColors = {
    default: 'bg-slate-400',
    success: 'bg-emerald-500 animate-pulse',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500 animate-pulse',
    info: 'bg-sky-500',
    purple: 'bg-primary',
    amber: 'bg-amber-500',
    outline: 'bg-slate-400',
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border whitespace-nowrap',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColors[variant])} />}
      {children}
    </span>
  );
};
