/**
 * The shelf is gated on the rotation scheduler being enabled: disabling
 * rotation leaves `leaving` rows in the DB, so without the gate the shelf keeps
 * advertising removals that will never happen.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { statusMock, leavingMoviesMock, cancelLeavingMock } = vi.hoisted(() => ({
  statusMock: vi.fn(),
  leavingMoviesMock: vi.fn(),
  cancelLeavingMock: vi.fn(),
}));

vi.mock('../media-api/index.js', () => ({
  rotationSchedulerStatus: (...args: unknown[]) => statusMock(...args),
  rotationSchedulerLeavingMovies: (...args: unknown[]) => leavingMoviesMock(...args),
  rotationSchedulerCancelLeaving: (...args: unknown[]) => cancelLeavingMock(...args),
}));

vi.mock('./MediaCard', () => ({
  MediaCard: ({ title }: { title: string }) => <div data-testid="media-card">{title}</div>,
}));

import { LeavingSoonShelf } from './LeavingSoonShelf';

function ok<T>(data: T) {
  return { data, error: undefined };
}

function renderShelf() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return render(<LeavingSoonShelf />, { wrapper });
}

const leavingMovie = {
  id: 1,
  title: 'Expiring',
  tmdbId: 99,
  posterPath: '/p.jpg',
  rotationExpiresAt: '2030-01-01T00:00:00.000Z',
};

describe('LeavingSoonShelf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leavingMoviesMock.mockResolvedValue(ok({ data: [leavingMovie] }));
  });

  it('renders the shelf when rotation is enabled', async () => {
    statusMock.mockResolvedValue(ok({ data: { isRunning: true } }));

    renderShelf();

    expect(await screen.findByText('Leaving Soon')).toBeInTheDocument();
    expect(screen.getByText('Expiring')).toBeInTheDocument();
  });

  it('renders nothing and never fetches leaving movies when rotation is disabled', async () => {
    statusMock.mockResolvedValue(ok({ data: { isRunning: false } }));

    const { container } = renderShelf();

    await waitFor(() => {
      expect(statusMock).toHaveBeenCalled();
    });
    expect(screen.queryByText('Leaving Soon')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
    expect(leavingMoviesMock).not.toHaveBeenCalled();
  });
});
