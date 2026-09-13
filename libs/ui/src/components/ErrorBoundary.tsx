/**
 * React Error Boundary
 * Catches errors in component tree and displays fallback UI.
 *
 * A failed dynamic import of a chunk a deploy removed reloads the page once
 * (see `reloadForStaleChunk`) and renders nothing meanwhile; the fallback is
 * shown only if the chunk is still missing after that reload.
 */
import { Component, type ReactNode } from 'react';

import { reloadForStaleChunk } from './stale-chunk-reload';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
  reloading: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reloading: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    if (reloadForStaleChunk(error)) {
      this.setState({ reloading: true });
      return;
    }
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.reloading) return null;
    if (this.state.error) {
      return this.props.fallback ? (
        this.props.fallback(this.state.error, this.reset)
      ) : (
        <div className="p-6">
          <h1 className="text-2xl font-bold text-destructive">Something went wrong</h1>
          <p className="mt-2 text-muted-foreground">{this.state.error.message}</p>
          <button
            onClick={this.reset}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
