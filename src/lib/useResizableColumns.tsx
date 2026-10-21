import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Column resizing for the wide data tables (Leads, SIMs, Tasks, ...).
 *
 * Widths are stored per user and per table so two unrelated grids never share
 * each other's layout. There is no server-side per-user preference store in
 * this app, so the least invasive persistence is a namespaced localStorage key
 * holding only integers — no customer data is written, only pixel widths.
 */

const STORAGE_PREFIX = 'mmba_col_widths_v1';

export interface ResizableColumnsOptions {
  /** Stable identifier for the table/view, e.g. 'leads.list'. */
  tableId: string;
  /** Current user id; widths are scoped per user. */
  userId?: string;
  /** Absolute pixel floor so a column cannot be collapsed away. */
  minWidth?: number;
  /** Absolute pixel ceiling so a column cannot swallow the table. */
  maxWidth?: number;
}

export interface ResizableColumnsResult {
  /** Inline width for a header cell, or undefined when never resized. */
  widthFor: (columnKey: string) => number | undefined;
  /** Style object for a header cell. */
  thStyle: (columnKey: string) => React.CSSProperties;
  /** Handlers to spread on a `<th>`. */
  thProps: (columnKey: string) => {
    style: React.CSSProperties;
    'data-col-key': string;
  };
  /** The drag handle to render inside a `<th>`. */
  renderHandle: (columnKey: string) => React.ReactNode;
  /** Style for the `<table>`; forces fixed layout once widths are customised. */
  tableStyle: React.CSSProperties;
  /** Restore this table's default layout and clear the persisted widths. */
  resetWidths: () => void;
  /** True when at least one column has a non-default width. */
  hasCustomWidths: boolean;
}

function storageKey(tableId: string, userId?: string): string {
  return `${STORAGE_PREFIX}:${tableId}:${userId || 'anon'}`;
}

function readWidths(tableId: string, userId?: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(storageKey(tableId, userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
    return out;
  } catch {
    // Corrupt or unavailable storage must never break rendering.
    return {};
  }
}

function writeWidths(tableId: string, userId: string | undefined, widths: Record<string, number>) {
  try {
    const key = storageKey(tableId, userId);
    if (Object.keys(widths).length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(widths));
    }
  } catch {
    /* quota/private-mode: resizing still works for this session */
  }
}

/** True when the document is laid out right-to-left. */
function isRtlLayout(): boolean {
  if (typeof document === 'undefined') return false;
  const explicit = document.documentElement.getAttribute('dir');
  if (explicit) return explicit.toLowerCase() === 'rtl';
  return typeof document !== 'undefined' && getComputedStyle(document.documentElement).direction === 'rtl';
}

export function useResizableColumns(options: ResizableColumnsOptions): ResizableColumnsResult {
  const { tableId, userId, minWidth = 80, maxWidth = 900 } = options;
  const [widths, setWidths] = useState<Record<string, number>>(() => readWidths(tableId, userId));
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const dragRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // Widths are user-scoped; switching accounts must not leak the other layout.
  useEffect(() => {
    setWidths(readWidths(tableId, userId));
  }, [tableId, userId]);

  const clamp = useCallback(
    (value: number) => Math.min(maxWidth, Math.max(minWidth, Math.round(value))),
    [minWidth, maxWidth]
  );

  const commit = useCallback(
    (next: Record<string, number>) => {
      setWidths(next);
      writeWidths(tableId, userId, next);
    },
    [tableId, userId]
  );

  useEffect(() => {
    if (!activeKey) return;

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const rtl = isRtlLayout();
      const delta = e.clientX - drag.startX;
      const width = clamp(drag.startWidth + (rtl ? -delta : delta));
      setWidths((prev) => ({ ...prev, [drag.key]: width }));
    };

    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      setActiveKey(null);
      if (!drag) return;
      // Persist only on release so dragging stays cheap.
      setWidths((prev) => {
        writeWidths(tableId, userId, prev);
        return prev;
      });
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [activeKey, clamp, tableId, userId]);

  const startResize = useCallback(
    (columnKey: string, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const th = (e.currentTarget as HTMLElement).closest('th');
      const startWidth = th?.getBoundingClientRect().width || 0;
      dragRef.current = { key: columnKey, startX: e.clientX, startWidth };
      setActiveKey(columnKey);
    },
    []
  );

  const nudge = useCallback(
    (columnKey: string, direction: -1 | 1, step = 16) => {
      const th = document.querySelector<HTMLElement>(`th[data-col-key="${CSS.escape(columnKey)}"]`);
      const base = widths[columnKey] || th?.getBoundingClientRect().width || 0;
      const rtl = isRtlLayout();
      // In RTL the "grow" direction visually points left, so arrow keys are mirrored.
      const sign = rtl ? -direction : direction;
      commit({ ...widths, [columnKey]: clamp(base + sign * step) });
    },
    [widths, clamp, commit]
  );

  const resetWidths = useCallback(() => {
    commit({});
  }, [commit]);

  const resetColumn = useCallback(
    (columnKey: string) => {
      const next = { ...widths };
      delete next[columnKey];
      commit(next);
    },
    [widths, commit]
  );

  const handleKeyDown = useCallback(
    (columnKey: string) => (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        nudge(columnKey, -1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nudge(columnKey, 1);
      } else if (e.key === 'Home') {
        // Reset only the focused column — the whole-table reset has its own button.
        e.preventDefault();
        resetColumn(columnKey);
      }
    },
    [nudge, resetColumn]
  );

  const widthFor = useCallback(
    (columnKey: string) => widths[columnKey],
    [widths]
  );

  const thStyle = useCallback(
    (columnKey: string): React.CSSProperties => {
      const w = widths[columnKey];
      if (!w) return {};
      return { width: w, minWidth: w, maxWidth: w, boxSizing: 'border-box' };
    },
    [widths]
  );

  const thProps = useCallback(
    (columnKey: string) => ({ style: thStyle(columnKey), 'data-col-key': columnKey }),
    [thStyle]
  );

  const renderHandle = useCallback(
    (columnKey: string): React.ReactNode => (
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`تغییر عرض ستون ${columnKey}`}
        tabIndex={0}
        data-testid={`resize-handle-${columnKey}`}
        onPointerDown={(e) => startResize(columnKey, e)}
        onKeyDown={handleKeyDown(columnKey)}
        className="absolute inset-y-0 z-10 flex w-2 cursor-col-resize items-center justify-center touch-none group/th"
        style={{ insetInlineEnd: -4 }}
      >
        <span className="h-6 w-px bg-slate-300 dark:bg-slate-600 opacity-40 group-hover/th:opacity-100 group-hover/th:bg-indigo-500" />
      </span>
    ),
    [startResize, handleKeyDown]
  );

  const hasCustomWidths = useMemo(() => Object.keys(widths).length > 0, [widths]);

  // In auto table layout CSS ignores max-width on cells, so the clamp would only
  // limit the drag input, not the rendered column. Switching to fixed layout
  // once anything is customised makes the persisted width authoritative; the
  // untouched default layout is left alone so existing tables render as before.
  const tableStyle = useMemo<React.CSSProperties>(
    () => (hasCustomWidths ? { tableLayout: 'fixed' } : {}),
    [hasCustomWidths]
  );

  return { widthFor, thStyle, thProps, renderHandle, tableStyle, resetWidths, hasCustomWidths };
}
