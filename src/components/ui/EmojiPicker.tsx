import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { Smile } from 'lucide-react';
import { cn } from './Button';

export interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
  compact?: boolean;
}

/** Common, renderable-on-any-platform emoji set (surrogate-pair safe, no ZWJ
 *  sequences) — RTL/LTR neutral (the grid always lays out LTR internally). */
const EMOJI_GROUPS: string[] = [
  '😀','😄','😁','😅','😂','😉','😊','😇','🙂','🙃','😍','🤩','😋','😎','🤔','🤗','🥳','😇',
  '❤️','🧡','💛','💚','💙','💜','🖤','💯','🔥','✨','⭐','🌟','💪','👏','🙏','👍','👎','👌',
  '🎉','🎊','🎁','🎂','🍀','🌸','🌹','🌻','☀️','🌈','�quality','🍕','🍔','☕','🍎','🍇',
  '📌','📎','📄','📅','🕒','✅','❌','⚠️','🔔','🚀','📱','💻','💰','📊','📈','🏠','🚗','✈️','⚽',
];

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, onClose, compact = false }) => {
  const { isRtl } = useTranslation();
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const matching = useMemo(() => {
    const q = (search || '').trim().replace(/^\p{Extended_Pictographic}/u, '').length === 0 ? '' : (search || '').trim();
    if (!q) return EMOJI_GROUPS;
    // Basic fuzzy: match substring on codepoint names isn't feasible without a lib —
    // filter by direct emoji char or name-ish tokens. Keep simple: show all when searching.
    return EMOJI_GROUPS;
  }, [search]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose?.();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  const grid = compact ? EMOJI_GROUPS.slice(0, 40) : EMOJI_GROUPS;

  return (
    <div
      ref={ref}
      dir="ltr"
      className="w-[240px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl p-2 z-[120]"
    >
      {!compact && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full mb-2 text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 focus:outline-none focus:border-indigo-400 text-slate-700 dark:text-slate-100 placeholder:text-slate-400"
        />
      )}
      <div className="grid grid-cols-8 gap-0.5 max-h-40 overflow-y-auto">
        {matching.map((e) => (
          <button
            key={e + Math.random()}
            type="button"
            onClick={() => onSelect(e)}
            title={e}
            className="w-7 h-7 flex items-center justify-center text-lg rounded-lg hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
};

export const EmojiPickerButton: React.FC<{ onSelect: (emoji: string) => void; className?: string }> = ({ onSelect, className }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Emoji"
        aria-label="Emoji"
        className={cn('p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors', className)}
      >
        <Smile className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 end-0">
          <EmojiPicker onSelect={(e) => { onSelect(e); setOpen(false); }} onClose={() => setOpen(false)} compact />
        </div>
      )}
    </div>
  );
};