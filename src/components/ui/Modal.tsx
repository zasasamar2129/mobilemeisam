import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from './Button';
import { useTranslation } from '../../lib/i18n';

// Modals can nest (e.g. creating a customer without leaving the originating
// form). Only the topmost open modal may answer Escape, otherwise one keypress
// closes the whole stack and the outer form's isOpen-gated reset wipes its draft.
//
// "Topmost" is read from the DOM rather than tracked in a module-level array:
// this file can be instantiated more than once in a session (HMR, or a lazily
// loaded chunk), and two copies would each keep their own stack — so a modal
// would compare itself against an empty list and stop answering Escape at all.
// DOM order is shared by every instance and matches what the user actually sees.
const MODAL_LAYER_ATTR = 'data-modal-layer';

function isTopmostOpenModal(el: HTMLElement | null): boolean {
  if (!el || typeof document === 'undefined') return false;
  const layers = document.querySelectorAll<HTMLElement>(`[${MODAL_LAYER_ATTR}]`);
  return layers.length > 0 && layers[layers.length - 1] === el;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full' | string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full' | string;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth,
  size,
  className,
}) => {
  const [mounted, setMounted] = useState(false);
  const { isRtl } = useTranslation();
  const rawMax = size || maxWidth || 'lg';

  useEffect(() => {
    setMounted(true);
  }, []);

  // Held in a ref so a parent re-render (new onClose identity) cannot re-run the
  // effect and re-append this modal's token — that would make a background modal
  // the "topmost" one and steal Escape from the modal actually on screen.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only the topmost open modal responds, so a nested modal closes alone.
      if (e.key === 'Escape' && isTopmostOpenModal(layerRef.current)) {
        onCloseRef.current();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      // Check if any OTHER modal layer is still open/mounting.
      // This layer is still mounted here (AnimatePresence keeps it for exit),
      // so it must be excluded.
      const others = [...document.querySelectorAll(`[${MODAL_LAYER_ATTR}]`)]
        .filter((el) => el !== layerRef.current);
      if (others.length === 0) {
        document.body.style.overflow = '';
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const maxWClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    full: 'max-w-[95vw] sm:max-w-6xl',
  };

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          ref={layerRef}
          {...{ [MODAL_LAYER_ATTR]: '' }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 app-modal-backdrop bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', damping: 26, stiffness: 360 }}
            className={cn(
              'relative w-full rounded-2xl bg-surface border border-primary text-primary shadow-2xl z-10 flex flex-col max-h-[90vh] overflow-hidden my-auto',
              maxWClasses[rawMax],
              className
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-4 sm:p-5 border-b border-primary bg-slate-50/80 dark:bg-surface-subtle/50">
              <div className="space-y-0.5 text-start flex-1 pe-2">
                {typeof title === 'string' ? (
                  <h3 className="text-base sm:text-lg font-bold text-primary">{title}</h3>
                ) : (
                  title
                )}
                {subtitle && (
                  typeof subtitle === 'string' ? (
                    <p className="text-xs text-muted">{subtitle}</p>
                  ) : (
                    <div className="text-xs text-muted">{subtitle}</div>
                  )
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-muted hover:text-secondary dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 rounded-lg transition-colors ms-2"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0 text-start">{children}</div>

            {/* Footer */}
            {footer && (
              <div className="p-4 sm:px-6 sm:py-4 border-t border-primary bg-slate-50/80 dark:bg-surface-subtle/50 flex items-center justify-end gap-2.5">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
