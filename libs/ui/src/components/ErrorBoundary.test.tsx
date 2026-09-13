import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';
import { reloadForStaleChunk } from './stale-chunk-reload';

vi.mock('./stale-chunk-reload', () => ({ reloadForStaleChunk: vi.fn() }));

function Throws({ error }: { error: Error }): never {
  throw error;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.mocked(reloadForStaleChunk).mockReset();
    vi.restoreAllMocks();
  });

  it('renders nothing while a stale-chunk reload is under way', () => {
    vi.mocked(reloadForStaleChunk).mockReturnValue(true);
    const error = new TypeError('Importing a module script failed.');

    const { container } = render(
      <ErrorBoundary fallback={() => <p>fallback</p>}>
        <Throws error={error} />
      </ErrorBoundary>
    );

    expect(reloadForStaleChunk).toHaveBeenCalledWith(error);
    expect(screen.queryByText('fallback')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the fallback when no reload was started', () => {
    vi.mocked(reloadForStaleChunk).mockReturnValue(false);

    render(
      <ErrorBoundary fallback={(error) => <p>fallback: {error.message}</p>}>
        <Throws error={new Error('boom')} />
      </ErrorBoundary>
    );

    expect(screen.getByText('fallback: boom')).toBeInTheDocument();
  });
});
