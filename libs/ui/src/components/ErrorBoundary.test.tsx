import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';
import { reloadForStaleChunk } from './stale-chunk-reload';

vi.mock(import('./stale-chunk-reload'), async (importOriginal) => ({
  ...(await importOriginal()),
  reloadForStaleChunk: vi.fn(),
}));

function Throws({ error }: { error: Error }): never {
  throw error;
}

function deferredVerdict() {
  let settle: (reloading: boolean) => void = () => undefined;
  const verdict = new Promise<boolean>((resolve) => {
    settle = resolve;
  });
  vi.mocked(reloadForStaleChunk).mockReturnValue(verdict);
  return settle;
}

const chunkError = new TypeError('Importing a module script failed.');

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.mocked(reloadForStaleChunk).mockReset();
    vi.restoreAllMocks();
  });

  it('renders nothing while the staleness probe runs', () => {
    deferredVerdict();

    const { container } = render(
      <ErrorBoundary fallback={() => <p>fallback</p>}>
        <Throws error={chunkError} />
      </ErrorBoundary>
    );

    expect(reloadForStaleChunk).toHaveBeenCalledWith(chunkError, { probeUrl: undefined });
    expect(screen.queryByText('fallback')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps rendering nothing once a reload has started', async () => {
    const settle = deferredVerdict();

    const { container } = render(
      <ErrorBoundary fallback={() => <p>fallback</p>}>
        <Throws error={chunkError} />
      </ErrorBoundary>
    );
    await act(async () => settle(true));

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the fallback once the build is found not to be stale', async () => {
    const settle = deferredVerdict();

    render(
      <ErrorBoundary fallback={(error) => <p>fallback: {error.message}</p>}>
        <Throws error={chunkError} />
      </ErrorBoundary>
    );
    expect(screen.queryByText(/fallback/)).toBeNull();
    await act(async () => settle(false));

    expect(screen.getByText(`fallback: ${chunkError.message}`)).toBeInTheDocument();
  });

  it('shows the fallback when the probe itself rejects', async () => {
    vi.mocked(reloadForStaleChunk).mockRejectedValue(new Error('reload threw'));

    render(
      <ErrorBoundary fallback={() => <p>fallback</p>}>
        <Throws error={chunkError} />
      </ErrorBoundary>
    );

    expect(await screen.findByText('fallback')).toBeInTheDocument();
  });

  it('passes a fresh probe URL from its prop for each probe', () => {
    deferredVerdict();
    const probeUrl = vi.fn(() => 'https://pops.example/media-ui/media.js?v=1');

    render(
      <ErrorBoundary fallback={() => <p>fallback</p>} staleChunkProbeUrl={probeUrl}>
        <Throws error={chunkError} />
      </ErrorBoundary>
    );

    expect(probeUrl).toHaveBeenCalledOnce();
    expect(reloadForStaleChunk).toHaveBeenCalledWith(chunkError, {
      probeUrl: 'https://pops.example/media-ui/media.js?v=1',
    });
  });

  it('renders the fallback immediately, without probing, for any other error', () => {
    render(
      <ErrorBoundary fallback={(error) => <p>fallback: {error.message}</p>}>
        <Throws error={new Error('boom')} />
      </ErrorBoundary>
    );

    expect(screen.getByText('fallback: boom')).toBeInTheDocument();
    expect(reloadForStaleChunk).not.toHaveBeenCalled();
  });
});
