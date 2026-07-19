import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import styles from './SearchableSelect.module.css';

export interface SearchableSelectOption {
  id: string;
  label: string;
  groupLabel: string;
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

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  // Sync displayed text from external value changes (e.g. picking a node on the map),
  // but don't clobber text the user is actively typing/searching.
  useEffect(() => {
    if (!editingRef.current) setQuery(selected?.label ?? '');
  }, [selected]);

  // Close on click outside the whole component
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as globalThis.Node)) {
        setOpen(false);
        editingRef.current = false;
        setQuery(selected?.label ?? '');
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, selected]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    const map = new Map<string, SearchableSelectOption[]>();
    for (const opt of filtered) {
      if (!map.has(opt.groupLabel)) map.set(opt.groupLabel, []);
      map.get(opt.groupLabel)!.push(opt);
    }
    return [...map.entries()];
  }, [options, query]);

  const flatFiltered = useMemo(() => groups.flatMap(([, opts]) => opts), [groups]);

  // Keep the highlighted option in view during keyboard navigation
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
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
      {open && !disabled && (
        <ul className={styles.listbox} role="listbox">
          {flatFiltered.length === 0 ? (
            <li className={styles.emptyMessage}>No matches</li>
          ) : (
            groups.map(([groupLabel, opts]) => (
              <li key={groupLabel} className={styles.group}>
                <div className={styles.groupLabel}>{groupLabel}</div>
                <ul className={styles.groupList}>
                  {opts.map((opt) => {
                    const flatIndex = flatFiltered.indexOf(opt);
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
                        {opt.label}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
