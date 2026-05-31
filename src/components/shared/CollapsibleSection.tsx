import { useState } from 'react';
import clsx from 'clsx';
import styles from './CollapsibleSection.module.css';

const STORAGE_PREFIX = 'office-navigator-panel:';

interface CollapsibleSectionProps {
  title: string;
  storageKey: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({ title, storageKey, defaultOpen = true, children }: CollapsibleSectionProps) {
  const key = STORAGE_PREFIX + storageKey;

  const [open, setOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as boolean) : defaultOpen;
    } catch {
      return defaultOpen;
    }
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch { /* quota exceeded or private browsing — silently ignore */ }
  };

  return (
    <div className={styles.collapsible}>
      <button type="button" className={styles.header} onClick={toggle}>
        <span className={clsx(styles.chevron, open && styles.chevronOpen)} />
        {title}
      </button>
      {open && <div className={styles.body}>{children}</div>}
    </div>
  );
}
