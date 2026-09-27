import React from 'react';
import { useTranslation } from '../../lib/i18n';

export interface MissingKeyViewProps {
  k: string;
  fallback?: string;
}

export const MissingKeyView: React.FC<MissingKeyViewProps> = ({ k, fallback }) => {
  const { t } = useTranslation();
  const val = t(k);
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production' && val === k) {
    return <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded border border-amber-500/30 font-mono">⚠️ missing:{k}</span>;
  }
  return <>{fallback || val}</>;
};