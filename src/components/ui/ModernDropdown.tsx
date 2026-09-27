import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeVariant?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'purple' | 'slate';
}

export interface ModernDropdownProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  label?: string;
  prefixIcon?: LucideIcon | React.ComponentType<{ className?: string }>;
  className?: string;
  buttonClassName?: string;
  align?: 'right' | 'left';
  size?: 'sm' | 'md' | 'lg';
}

export function ModernDropdown<T extends string = string>({
  value,
  onChange,
  options = [],
  label,
  prefixIcon: PrefixIcon,
  className = '',
  buttonClassName = '',
  align = 'right',
  size = 'md',
}: ModernDropdownProps<T>) {
  const safeOptions = options || [];
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectedOption = safeOptions.find((opt) => opt.value === value) || safeOptions[0];
  const SelectedIcon = selectedOption?.icon;

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs rounded-xl gap-1.5',
    md: 'px-3 py-2 text-xs sm:text-sm rounded-xl gap-2',
    lg: 'px-4 py-2.5 text-sm rounded-2xl gap-2.5',
  };

  return (
    <div ref={dropdownRef} className={`relative inline-block text-start ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`group flex items-center justify-between transition-all duration-200 cursor-pointer font-medium select-none
          bg-surface hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-[0.98]
          border border-primary hover:border-indigo-500/40
          text-secondary dark:text-slate-200 shadow-xs
          ${sizeClasses[size]}
          ${isOpen ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-slate-50 dark:bg-slate-800' : ''}
          ${buttonClassName}`}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {/* Prefix or Option Icon with modern glowing badge container */}
          {PrefixIcon ? (
            <div className="p-1 rounded-lg bg-primary-light dark:bg-primary/10 text-primary border border-indigo-200 dark:border-indigo-500/20 group-hover:bg-indigo-100 dark:group-hover:bg-primary/20 transition-colors">
              <PrefixIcon className="w-3.5 h-3.5" />
            </div>
          ) : SelectedIcon ? (
            <div className="p-1 rounded-lg bg-primary-light dark:bg-primary/10 text-primary border border-indigo-200 dark:border-indigo-500/20 group-hover:bg-indigo-100 dark:group-hover:bg-primary/20 transition-colors">
              <SelectedIcon className="w-3.5 h-3.5" />
            </div>
          ) : null}

          {/* Label text */}
          {label && (
            <span className="text-muted text-xs font-normal whitespace-nowrap">
              {label}
            </span>
          )}

          {/* Current selected value */}
          <span className="font-bold text-primary whitespace-nowrap group-hover:text-primary dark:group-hover:text-white transition-colors">
            {selectedOption?.label}
          </span>
        </div>

        {/* Animated Chevron */}
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted ms-1.5 transition-transform duration-200 ease-out group-hover:text-secondary dark:group-hover:text-slate-200 ${
            isOpen ? 'rotate-180 text-indigo-500 dark:text-indigo-400' : ''
          }`}
        />
      </button>

      {/* Floating Animated Popover Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`absolute ${align === 'left' ? 'start-0' : 'end-0'} mt-1.5 min-w-[220px] sm:min-w-[240px] z-50
              p-1.5 rounded-2xl
              bg-surface border border-primary
              shadow-xl dark:shadow-2xl shadow-slate-200/50 dark:shadow-slate-950/60
              space-y-1`}
            role="listbox"
          >
            {label && (
              <div className="px-3 py-1.5 text-[11px] font-bold text-muted border-b border-slate-100 dark:border-border-subtle mb-1 flex items-center justify-between">
                <span>{label}</span>
                <span className="text-[10px] text-primary font-mono">
                  {safeOptions.length}
                </span>
              </div>
            )}

            {safeOptions.map((option) => {
              const isSelected = option.value === value;
              const OptionIcon = option.icon;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-start transition-all duration-150 cursor-pointer
                    ${
                      isSelected
                        ? 'bg-primary-light dark:bg-primary/15 text-primary font-bold border border-primary'
                        : 'text-secondary hover:text-slate-900 dark:hover:text-slate-100 hover:bg-surface-subtle dark:hover:bg-slate-800 border border-transparent'
                    }`}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    {OptionIcon && (
                      <div
                        className={`p-1.5 rounded-lg transition-colors ${
                          isSelected
                            ? 'bg-primary text-white shadow-xs'
                            : 'bg-surface-subtle text-muted group-hover:text-secondary dark:group-hover:text-slate-200'
                        }`}
                      >
                        <OptionIcon className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div className="flex flex-col text-start">
                      <span className={`text-xs ${isSelected ? 'text-primary font-bold' : 'text-slate-900 dark:text-slate-200'}`}>
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="text-[10px] text-muted font-normal">
                          {option.description}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Selected checkmark badge */}
                  {isSelected && (
                    <div className="p-1 rounded-full bg-primary/20 text-primary ms-2 shrink-0">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
