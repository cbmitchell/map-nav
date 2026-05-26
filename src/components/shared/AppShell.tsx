import { useState } from 'react';
import { Editor } from '../Editor/Editor';
import { Navigator } from '../Navigator/Navigator';
import { ErrorBoundary } from './ErrorBoundary';

type AppMode = 'editor' | 'navigator';

export function AppShell() {
  const [mode, setMode] = useState<AppMode>('editor');

  return (
    <div style={styles.shell}>
      <header style={styles.topBar}>
        <span style={styles.appName}>Office Navigator</span>
        <div style={styles.modeToggle}>
          <button
            style={{ ...styles.modeBtn, ...(mode === 'editor' ? styles.modeBtnActive : {}) }}
            onClick={() => setMode('editor')}
          >
            Editor
          </button>
          <button
            style={{ ...styles.modeBtn, ...(mode === 'navigator' ? styles.modeBtnActive : {}) }}
            onClick={() => setMode('navigator')}
          >
            Navigator
          </button>
        </div>
      </header>
      <main style={styles.main}>
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

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    height: 48,
    background: '#111',
    borderBottom: '1px solid #333',
    flexShrink: 0,
  },
  appName: {
    fontWeight: 600,
    fontSize: 16,
    letterSpacing: '0.02em',
  },
  modeToggle: {
    display: 'flex',
    gap: 4,
  },
  modeBtn: {
    padding: '4px 16px',
    borderRadius: 4,
    border: '1px solid #444',
    background: 'transparent',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: 14,
  },
  modeBtnActive: {
    background: '#2a2a2a',
    color: '#fff',
    borderColor: '#666',
  },
  main: {
    flex: 1,
    overflow: 'hidden',
  },
};
