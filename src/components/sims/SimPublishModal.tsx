import React, { useState } from 'react';
import { Smartphone, Globe, Tag, AlertCircle, Send } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useTranslation } from '../../lib/i18n';
import { useToast } from '../ui/Toast';
import { updateSimDisplayFields } from '../../services/wordpressSync';
import { SimCard } from '../../types';

export interface SimPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  sim: SimCard | null;
  onSuccess: () => void;
}

export const SimPublishModal: React.FC<SimPublishModalProps> = ({ isOpen, onClose, sim, onSuccess }) => {
  const { t, isRtl } = useTranslation();
  const { success, error } = useToast();
  const [rondType1, setRondType1] = useState('');
  const [rondType2, setRondType2] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (sim) {
      setRondType1(sim.roundCategory || '');
      setRondType2(sim.category || '');
    }
  }, [sim]);

  const handlePublish = async () => {
    if (!sim) return;

    setIsSaving(true);
    try {
      const res = await updateSimDisplayFields({
        publicId: sim.websitePublicId || sim.id,
        version: sim.websiteSyncVersion || 0,
        phoneNumber: sim.phoneNumber,
        rondType1,
        rondType2,
        listingStatus: 'PUBLISHED',
      });
      if (res.success) {
        success(res.message);
        onSuccess();
        onClose();
      } else {
        error(res.message);
      }
    } catch (err: any) {
      error(err.message || 'خطا در انتشار');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-indigo-500" />
          <span>{isRtl ? `انتشار شماره ${sim?.phoneNumber}` : `Publish Listing: ${sim?.phoneNumber}`}</span>
        </div>
      }
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handlePublish}
            disabled={isSaving}
            leftIcon={<Send className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />}
          >
            {isRtl ? 'انتشار در وردپرس' : 'Publish to WordPress'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 p-1">
        <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 space-y-2">
          <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-900 dark:text-indigo-300">
            <Smartphone className="w-4 h-4" />
            <span>{isRtl ? 'اطلاعات شماره' : 'Listing Information'}</span>
          </div>
          <div className="text-[11px] text-slate-500">
            {isRtl ? 'شماره خط:' : 'Phone:'} <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{sim?.phoneNumber}</span>
          </div>
        </div>

        <div className="space-y-4">
          <Input
            label={isRtl ? 'نوع رند ۱ (rond_type_1)' : 'Rond Type 1 (rond_type_1)'}
            value={rondType1}
            onChange={(e) => setRondType1(e.target.value)}
            placeholder={isRtl ? 'مثال: استپ دار خشک' : 'e.g. Step / Mirror'}
            leftIcon={<Tag className="w-4 h-4 text-slate-400" />}
          />

          <Input
            label={isRtl ? 'نوع رند ۲ (rond_type_2)' : 'Rond Type 2 (rond_type_2)'}
            value={rondType2}
            onChange={(e) => setRondType2(e.target.value)}
            placeholder={isRtl ? 'مثال: رند / معمولی' : 'e.g. Round / Normal'}
            leftIcon={<Smartphone className="w-4 h-4 text-slate-400" />}
          />
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 rounded-xl flex gap-3 items-start">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
            {isRtl
              ? 'با فشردن دکمه انتشار، مقادیر فوق مستقیماً روی فیلدهای ACF وردپرس نوشته می‌شود.'
              : 'Pressing publish writes these values directly to the WordPress ACF fields.'}
          </p>
        </div>
      </div>
    </Modal>
  );
};
