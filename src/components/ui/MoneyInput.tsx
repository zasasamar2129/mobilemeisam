import React, { useState, useEffect } from 'react';
import { parseTomanInput, formatToman } from '../../lib/currencyUtils';
import { useTranslation } from '../../lib/i18n';
import { cn } from './Button';

export interface MoneyInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  error?: string;
  required?: boolean;
  allowNegative?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export const MoneyInput: React.FC<MoneyInputProps> = ({
  value,
  onChange,
  label,
  error,
  required,
  allowNegative,
  disabled,
  placeholder,
  className,
}) => {
  const { t } = useTranslation();
  const [displayValue, setDisplayValue] = useState<string>(() => (value ? formatToman(value) : ''));

  useEffect(() => {
    setDisplayValue(value ? formatToman(value) : '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    const isNeg = allowNegative && raw.startsWith('-');
    if (isNeg) raw = raw.slice(1);
    const num = parseTomanInput(raw);
    const finalVal = isNeg ? -num : num;
    onChange(finalVal);
    setDisplayValue(raw ? (isNeg ? '-' : '') + (num ? num.toLocaleString() : '') : '');
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && (
        <label className="text-xs font-semibold text-text-secondary flex items-center justify-between">
          <span>
            {label} {required && <span className="text-danger">*</span>}
          </span>
          <span className="text-xs text-text-muted">{t('common.toman')}</span>
        </label>
      )}
      <input
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder || '۰'}
        className={cn(
          'w-full px-3 py-2 text-sm rounded-xl border bg-surface text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary tabular-nums',
          error ? 'border-danger focus:ring-danger' : 'border-primary'
        )}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
};