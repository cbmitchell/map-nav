import { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { Editor } from '../Editor/Editor';
import { Navigator } from '../Navigator/Navigator';
import { ErrorBoundary } from './ErrorBoundary';
import { useGraphReducer } from '../../hooks/useGraphReducer';
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
  const { state, dispatch, undo, storageError } = useGraphReducer();

  const [nameDraft, setNameDraft] = useState(state.name);
  const nameFocusedRef = useRef(false);
  useEffect(() => {
    if (!nameFocusedRef.current) setNameDraft(state.name);
  }, [state.name]);

  const commitName = () => {
    const trimmed = nameDraft.trim() || 'Untitled Building';
    setNameDraft(trimmed);
    if (trimmed !== state.name) {
      dispatch({ type: 'UPDATE_BUILDING_NAME', payload: { name: trimmed } });
    }
  };

  useEffect(() => {
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
  }, [mode]);

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        {mode === 'editor' ? (
          <input
            className={styles.appNameInput}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onFocus={() => { nameFocusedRef.current = true; }}
            onBlur={() => { nameFocusedRef.current = false; commitName(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
        ) : (
          <span className={styles.appName}>{state.name}</span>
        )}
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
            <Editor state={state} dispatch={dispatch} undo={undo} storageError={storageError} />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary label="Navigator">
            <Navigator state={state} />
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}

