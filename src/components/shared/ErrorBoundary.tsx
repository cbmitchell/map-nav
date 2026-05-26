import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary: ${this.props.label ?? 'unknown'}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={styles.container}>
          <p style={styles.heading}>Something went wrong</p>
          <p style={styles.message}>{this.state.error.message}</p>
          <button
            style={styles.btn}
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 12,
    color: '#888',
  },
  heading: {
    fontSize: 18,
    fontWeight: 600,
    color: '#D85A30',
    margin: 0,
  },
  message: {
    fontSize: 13,
    color: '#666',
    margin: 0,
    maxWidth: 400,
    textAlign: 'center',
  },
  btn: {
    marginTop: 8,
    padding: '5px 16px',
    background: 'transparent',
    border: '1px solid #444',
    borderRadius: 4,
    color: '#aaa',
    cursor: 'pointer',
    fontSize: 13,
  },
};
