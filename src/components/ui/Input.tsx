import React from 'react';
import { cn } from './Button';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isRequired?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, leftIcon, rightIcon, isRequired, id, ...props }, ref) => {
    const inputId = id || (label ? `input-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

    return (
      <div className="w-full space-y-1.5 text-right">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-secondary">
            {label}
            {isRequired && <span className="text-rose-500 dark:text-rose-400 mr-1">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 inset-y-0 flex items-center pointer-events-none text-muted">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={cn(
              'w-full rounded-xl bg-surface/80 border border-primary/80 text-primary text-sm px-3.5 py-2.5 transition-all duration-200 placeholder:text-muted dark:placeholder:text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:bg-surface-subtle dark:disabled:bg-slate-950',
              leftIcon ? 'pl-10' : '',
              rightIcon ? 'pr-10' : '',
              error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : '',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 inset-y-0 flex items-center pointer-events-none text-muted">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
        {helperText && !error && <p className="text-xs text-muted mt-1">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
