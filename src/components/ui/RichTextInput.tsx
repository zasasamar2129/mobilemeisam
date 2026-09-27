import React from 'react';
import { Textarea, TextareaProps } from './Textarea';
import { EmojiPickerButton } from './EmojiPicker';

export interface RichTextInputProps extends TextareaProps {
  /** Enables inline emoji picker button in the header bar. */
  enableEmoji?: boolean;
}

/** RichTextInput (§16): Text + Emoji + future formatting hooks. */
export const RichTextInput = React.forwardRef<HTMLTextAreaElement, RichTextInputProps>(
  ({ enableEmoji = true, actionButton, value, onChange, ...props }, ref) => {
    const handleEmoji = (emoji: string) => {
      const el = (ref as React.RefObject<HTMLTextAreaElement>)?.current;
      const current = (value ?? '') as string;
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;
      const next = current.substring(0, start) + emoji + current.substring(end);
      onChange?.({ target: { value: next } } as any);
      // Restore caret after the controlled update.
      requestAnimationFrame(() => {
        if (el) {
          el.focus();
          el.setSelectionRange(start + emoji.length, start + emoji.length);
        }
      });
    };

    const combinedAction = (
      <div className="flex items-center gap-1">
        {actionButton}
        {enableEmoji && <EmojiPickerButton onSelect={handleEmoji} />}
      </div>
    );

    return <Textarea ref={ref} value={value} onChange={onChange} actionButton={combinedAction} {...props} />;
  }
);

RichTextInput.displayName = 'RichTextInput';