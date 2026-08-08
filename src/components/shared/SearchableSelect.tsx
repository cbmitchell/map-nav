import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useMobile } from '../../hooks/useMobile';
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

interface ListboxCoords {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function SearchableSelect({ options, value, onChange, placeholder, disabled }: SearchableSelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [coords, setCoords] = useState<ListboxCoords | null>(null);
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
  useEffect(() => {
    if (!open) return;
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
  }, [open, selected]);

  // While open on mobile/tablet, track the input's on-screen position so the
  // portaled listbox can be anchored under it with position: fixed, escaping
  // NavigatorControls' scrolling/clipped .tabContent ancestor.
  useLayoutEffect(() => {
    if (!open || !usePortal) return;
    const recompute = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCoords({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(120, window.innerHeight - rect.bottom - 8),
      });
    };
    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    window.addEventListener('orientationchange', recompute);
    window.visualViewport?.addEventListener('resize', recompute);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
      window.removeEventListener('orientationchange', recompute);
      window.visualViewport?.removeEventListener('resize', recompute);
    };
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
      inputRef.current?.blur();
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

  const listbox = open && !disabled && (
    usePortal ? (
      createPortal(
        <ul
          ref={listboxRef}
          className={clsx(styles.listbox, styles.listboxPortal)}
          style={coords ? { top: coords.top, left: coords.left, width: coords.width, maxHeight: coords.maxHeight } : undefined}
          role="listbox"
        >
          {listboxBody}
        </ul>,
        document.body,
      )
    ) : (
      <ul ref={listboxRef} className={styles.listbox} role="listbox">
        {listboxBody}
      </ul>
    )
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
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {selected && !disabled && (
          <button type="button" className={styles.clearBtn} onMouseDown={handleClear} title="Clear">×</button>
        )}
      </div>
      {listbox}
    </div>
  );
}
