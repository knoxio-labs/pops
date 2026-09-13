/**
 * React Error Boundary
 * Catches errors in component tree and displays fallback UI.
 *
 * A failed dynamic import renders nothing while `reloadForStaleChunk` probes
 * whether the build is stale. A confirmed stale build reloads the page once;
 * any other verdict (the module's server is down, the file still exists, the
 * probe timed out) shows the fallback.
 */
import { Component, type ReactNode } from 'react';

import { isStaleChunkError, reloadForStaleChunk } from './stale-chunk-reload';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /**
   * Returns a URL that answers 2xx whenever the server hosting this subtree's
   * modules is up. Called once per probe, so it can return a URL no cache has
   * seen. Consulted only when the import error names no URL (WebKit); without
   * it a WebKit chunk failure shows the fallback instead of reloading.
   */
  staleChunkProbeUrl?: () => string;
}

interface State {
  error: Error | null;
  checkingStaleChunk: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, checkingStaleChunk: false };

  private unmounted = false;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, checkingStaleChunk: isStaleChunkError(error) };
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    if (!isStaleChunkError(error)) {
      console.error('ErrorBoundary caught:', error, errorInfo);
      return;
    }
    void this.settleStaleChunk(error, errorInfo);
  }

  componentWillUnmount() {
    this.unmounted = true;
  }

  private async settleStaleChunk(error: Error, errorInfo: unknown) {
    const reloading = await reloadForStaleChunk(error, {
      probeUrl: this.props.staleChunkProbeUrl?.(),
    }).catch(() => false);
    if (reloading || this.unmounted || this.state.error !== error) return;
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ checkingStaleChunk: false });
  }

  reset = () => {
    this.setState({ error: null, checkingStaleChunk: false });
  };

  render() {
    if (this.state.checkingStaleChunk) return null;
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
