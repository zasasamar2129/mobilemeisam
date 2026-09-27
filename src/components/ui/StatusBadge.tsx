import React from 'react';
import { Badge, BadgeProps } from './Badge';
import { useTranslation } from '../../lib/i18n';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';

export interface StatusBadgeProps {
  status: string;
  tone?: StatusTone;
  labelKey?: string;
  labelFallback?: string;
  size?: BadgeProps['size'];
  showDot?: boolean;
}

export const STATUS_TONES: Record<string, StatusTone> = {
  PAID: 'success',
  FULL_REFUND: 'success',
  AVAILABLE: 'success',
  COMPLETED: 'success',
  APPROVED: 'success',
  VERIFIED: 'success',
  PARTIALLY_PAID: 'warning',
  PARTIAL_REFUND: 'warning',
  PENDING: 'warning',
  REPORTED: 'warning',
  RESERVED: 'warning',
  PENDING_INSPECTION: 'warning',
  UNPAID: 'danger',
  NO_REFUND: 'neutral',
  REVERSED: 'danger',
  RETURNED: 'danger',
  DECOMMISSIONED: 'neutral',
  CANCELLED: 'danger',
  REJECTED: 'danger',
  SOLD: 'info',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  tone,
  labelKey,
  labelFallback,
  size = 'md',
  showDot = true,
}) => {
  const { t } = useTranslation();
  const effectiveTone = tone || STATUS_TONES[status] || 'neutral';

  const variantMap: Record<StatusTone, BadgeProps['variant']> = {
    success: 'success',
    warning: 'warning',
    danger: 'danger',
    info: 'info',
    neutral: 'default',
    primary: 'purple',
  };

  const text = labelKey ? t(labelKey) : labelFallback || t(`sim.status.${status.toLowerCase()}`) || status;

  return (
    <Badge variant={variantMap[effectiveTone]} size={size} dot={showDot}>
      {text}
    </Badge>
  );
};