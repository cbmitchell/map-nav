import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useMobile } from '../../hooks/useMobile';
import { lockBodyScroll, unlockBodyScroll } from '../../utils/scrollLock';
import styles from './SearchableSelect.module.css';

export interface SearchableSelectOption {
  id: string;
  label: string;
  groupLabel: string;
  aliases?: string[];
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
  disabled?: boolean;
}

export function SearchableSelect({ options, value, onChange, placeholder, disabled }: SearchableSelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const editingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const { isMobile, isTablet } = useMobile();
  const usePortal = isMobile || isTablet;

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  // Sync displayed text from external value changes (e.g. picking a node on the map),
  // but don't clobber text the user is actively typing/searching.
  useEffect(() => {
    if (!editingRef.current) setQuery(selected?.label ?? '');
  }, [selected]);

  // Close on click outside the whole component (including the portaled listbox,
  // which sits outside containerRef's subtree on mobile)
  // Desktop only — on mobile/tablet the dropdown is a full-screen overlay with its own
  // explicit Cancel button, so there's no "outside" to detect a click against.
  useEffect(() => {
    if (!open || usePortal) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as globalThis.Node;
      const inContainer = containerRef.current?.contains(target) ?? false;
      const inListbox = listboxRef.current?.contains(target) ?? false;
      if (!inContainer && !inListbox) {
        setOpen(false);
        editingRef.current = false;
        setQuery(selected?.label ?? '');
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, selected, usePortal]);

  // While open on mobile/tablet, lock body scroll as a defensive measure against iOS Safari's
  // native "scroll the focused input into view above the keyboard" behavior, which can ignore
  // overflow: hidden. The full-screen overlay below is the primary fix (its own input is
  // already fixed-position and fully visible, so there's nothing for iOS to need to reveal).
  useEffect(() => {
    if (!open || !usePortal) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [open, usePortal]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? options.filter(
          (o) => o.label.toLowerCase().includes(q) || (o.aliases?.some((a) => a.toLowerCase().includes(q)) ?? false),
        )
      : options;
    const map = new Map<string, SearchableSelectOption[]>();
    for (const opt of filtered) {
      if (!map.has(opt.groupLabel)) map.set(opt.groupLabel, []);
      map.get(opt.groupLabel)!.push(opt);
    }
    return [...map.entries()];
  }, [options, query]);

  const flatFiltered = useMemo(() => groups.flatMap(([, opts]) => opts), [groups]);

  // Which alias (if any) drove a given option's match, so the dropdown can show
  // "matched: <alias>" only when the label itself didn't already match the query.
  const aliasHints = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, string>();
    if (!q) return map;
    for (const opt of flatFiltered) {
      if (opt.label.toLowerCase().includes(q)) continue;
      const matched = opt.aliases?.find((a) => a.toLowerCase().includes(q));
      if (matched) map.set(opt.id, matched);
    }
    return map;
  }, [flatFiltered, query]);

  // Keep the highlighted option in view during keyboard navigation
  useEffect(() => {
    if (!open) return;
    const el = listboxRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const commitSelection = (opt: SearchableSelectOption | null) => {
    onChange(opt?.id ?? null);
    setQuery(opt?.label ?? '');
    setOpen(false);
    editingRef.current = false;
  };

  const handleFocus = () => {
    editingRef.current = true;
    setOpen(true);
    setQuery('');
    setHighlight(0);
  };

  // Mobile/tablet trigger is read-only (opens the full-screen overlay instead of taking the
  // keyboard itself) — blur it immediately so the overlay's own input is unambiguously the one
  // that's focused.
  const handleTriggerFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.blur();
    editingRef.current = true;
    setOpen(true);
    setQuery('');
    setHighlight(0);
  };

  const handleCancel = () => {
    setOpen(false);
    editingRef.current = false;
    setQuery(selected?.label ?? '');
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Ignore blur caused by focus moving to something inside this component
    if (containerRef.current && e.relatedTarget && containerRef.current.contains(e.relatedTarget as globalThis.Node)) {
      return;
    }
    setOpen(false);
    editingRef.current = false;
    setQuery(selected?.label ?? '');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    editingRef.current = true;
    setOpen(true);
    setQuery(e.target.value);
    setHighlight(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); setHighlight(0); return; }
      setHighlight((h) => Math.min(h + 1, flatFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && flatFiltered[highlight]) commitSelection(flatFiltered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      editingRef.current = false;
      setQuery(selected?.label ?? '');
      (document.activeElement as HTMLElement | null)?.blur();
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    commitSelection(null);
    inputRef.current?.focus();
  };

  const listboxBody = flatFiltered.length === 0 ? (
    <li className={styles.emptyMessage}>No matches</li>
  ) : (
    groups.map(([groupLabel, opts]) => (
      <li key={groupLabel} className={styles.group}>
        <div className={styles.groupLabel}>{groupLabel}</div>
        <ul className={styles.groupList}>
          {opts.map((opt) => {
            const flatIndex = flatFiltered.indexOf(opt);
            const hint = aliasHints.get(opt.id);
            return (
              <li
                key={opt.id}
                data-idx={flatIndex}
                role="option"
                aria-selected={opt.id === value}
                className={clsx(styles.option, flatIndex === highlight && styles.optionHighlighted)}
                onMouseEnter={() => setHighlight(flatIndex)}
                // eslint-disable-next-line react-hooks/refs -- commitSelection's ref write runs from this event handler, never during render
                onMouseDown={(e) => { e.preventDefault(); commitSelection(opt); }}
              >
                <div className={styles.optionLabel}>{opt.label}</div>
                {hint && <div className={styles.optionHint}>matched: {hint}</div>}
              </li>
            );
          })}
        </ul>
      </li>
    ))
  );

  // Mobile/tablet: focusing the trigger opens a full-screen overlay with its own input,
  // rather than a small popup anchored under the (soon to be keyboard-obscured) field. The
  // overlay's input is already at a fixed, fully-visible position, so there's nothing for iOS
  // Safari to need to scroll into view — sidestepping the drift/scroll bugs a floating popup
  // anchored under the field ran into.
  const mobileOverlay = open && !disabled && usePortal && createPortal(
    <div className={styles.mobileOverlay}>
      <div className={styles.mobileHeader}>
        <input
          autoFocus
          className={styles.mobileInput}
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        <button type="button" className={styles.mobileCancelBtn} onClick={handleCancel}>Cancel</button>
      </div>
      <ul ref={listboxRef} className={styles.mobileListbox} role="listbox">
        {listboxBody}
      </ul>
    </div>,
    document.body,
  );

  const listbox = open && !disabled && !usePortal && (
    <ul ref={listboxRef} className={styles.listbox} role="listbox">
      {listboxBody}
    </ul>
  );

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.inputRow}>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={usePortal}
          onFocus={usePortal ? handleTriggerFocus : handleFocus}
          onBlur={usePortal ? undefined : handleBlur}
          onChange={usePortal ? undefined : handleChange}
          onKeyDown={usePortal ? undefined : handleKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {selected && !disabled && (
          <button type="button" className={styles.clearBtn} onMouseDown={handleClear} title="Clear">×</button>
        )}
      </div>
      {listbox}
      {mobileOverlay}
    </div>
  );
}
