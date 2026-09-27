import React, { useRef } from 'react';
import { useTranslation } from '../../lib/i18n';
import { EmojiPickerButton } from './EmojiPicker';
import { cn } from './Button';

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  /** Renders the attach button on the left edge. */
  onAttach?: () => void;
  /** Attach button custom label. */
  maxLength?: number;
  className?: string;
  /** Ref to the inner textarea (for focus control from parents). */
  composerRef?: React.Ref<HTMLTextAreaElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  autoFocus?: boolean;
}

/** ChatComposer (§16 — Text + Emoji + Attachment, native keyboard friendly). */
export const ChatComposer: React.FC<ChatComposerProps> = ({
  value,
  onChange,
  onSend,
  placeholder,
  onAttach,
  maxLength = 3000,
  className,
  composerRef,
  onKeyDown,
  autoFocus,
}) => {
  const { isRtl } = useTranslation();
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const taRef = (composerRef || innerRef) as React.RefObject<HTMLTextAreaElement>;

  const insertEmoji = (emoji: string) => {
    const el = taRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.substring(0, start) + emoji + value.substring(end);
    onChange(next.slice(0, maxLength));
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(start + emoji.length, start + emoji.length);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Persian/Arabic IMEs fire Enter while composing — don't send mid-composition.
    if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as any).isComposing) {
      e.preventDefault();
      onSend();
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div className={cn('flex items-end gap-2', className)}>
      {onAttach && (
        <button
          type="button"
          onClick={onAttach}
          title={isRtl ? 'پیوست فایل یا سند' : 'Attach'}
          className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
      )}
      <textarea
        ref={composerRef || innerRef}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="flex-1 text-xs px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 resize-none max-h-32 leading-relaxed"
      />
      <EmojiPickerButton onSelect={insertEmoji} />
    </div>
  );
};