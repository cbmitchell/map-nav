import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { Editor } from '../Editor/Editor';
import { Navigator } from '../Navigator/Navigator';
import { ErrorBoundary } from './ErrorBoundary';
import { useMobile } from '../../hooks/useMobile';
import styles from './AppShell.module.css';

type AppMode = 'editor' | 'navigator';

const MODE_KEY = 'office-navigator-mode';

function loadMode(): AppMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === 'navigator') return 'navigator';
  } catch { /* ignore */ }
  return 'editor';
}

export function AppShell() {
  const [mode, setMode] = useState<AppMode>(loadMode);
  const { isMobile } = useMobile();

  useEffect(() => {
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
  }, [mode]);

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <span className={styles.appName}>{isMobile ? 'Mapper' : 'Office Navigator'}</span>
        <div className={styles.modeToggle}>
          <button
            className={clsx(styles.modeBtn, mode === 'editor' && styles.modeBtnActive)}
            onClick={() => setMode('editor')}
          >
            Editor
          </button>
          <button
            className={clsx(styles.modeBtn, mode === 'navigator' && styles.modeBtnActive)}
            onClick={() => setMode('navigator')}
          >
            Navigator
          </button>
        </div>
      </header>
      <main className={styles.main}>
        {mode === 'editor' ? (
          <ErrorBoundary label="Editor">
            <Editor />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary label="Navigator">
            <Navigator />
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}

