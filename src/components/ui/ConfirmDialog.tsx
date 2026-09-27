import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { useTranslation } from '../../lib/i18n';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  isLoading,
}) => {
  const { t } = useTranslation();
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div className="text-sm text-text-secondary leading-relaxed">{message}</div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            {cancelLabel || t('common.cancel')}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel || t('common.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};