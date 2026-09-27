import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FixturesList } from './fixtures-list.js';

import type { FixturesListProps } from './fixtures-list.js';

function row(id: string, name: string) {
  return {
    createdAt: '2026-09-01T00:00:00.000Z',
    id,
    lastEditedTime: '2026-09-01T00:00:00.000Z',
    locationId: null,
    name,
    notes: null,
    type: 'power',
    wiredCount: 1,
    wiredNames: ['Lamp'],
  };
}

function props(overrides: Partial<FixturesListProps> = {}): FixturesListProps {
  return {
    rows: [row('fixture-1', 'Desk outlet')],
    total: 1,
    unfilteredTotal: 1,
    queryDraft: '',
    filter: { query: '', kind: 'all' },
    locations: [],
    status: 'success',
    hasLoaded: true,
    hasNextPage: false,
    onLoadMore: vi.fn(),
    onFilterChange: vi.fn(),
    onClearFilters: vi.fn(),
    onOpen: vi.fn(),
    onEdit: vi.fn(),
    onNew: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

describe('FixturesList', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders server room and wired summaries and exposes open/edit actions', () => {
    const view = props();
    render(<FixturesList {...view} />);

    expect(screen.getByText('Desk outlet')).toBeInTheDocument();
    expect(screen.getByText('Lamp')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Desk outlet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Desk outlet' }));
    expect(view.onOpen).toHaveBeenCalledWith('fixture-1');
    expect(view.onEdit).toHaveBeenCalledWith(view.rows[0]);
  });

  it('passes raw filter changes to the page model without filtering rows locally', () => {
    const view = props();
    render(<FixturesList {...view} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter by fixture or wired item' }), {
      target: { value: 'lamp' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Kind' }), {
      target: { value: 'light' },
    });

    expect(view.onFilterChange).toHaveBeenNthCalledWith(1, { query: 'lamp' });
    expect(view.onFilterChange).toHaveBeenNthCalledWith(2, { kind: 'light' });
    expect(screen.getByText('Desk outlet')).toBeInTheDocument();
  });

  it('distinguishes first-use empty and filtered-empty states', () => {
    const onNew = vi.fn();
    const { rerender } = render(
      <FixturesList {...props({ rows: [], total: 0, unfilteredTotal: 0, onNew })} />
    );
    expect(screen.getByText('No fixtures recorded')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New fixture' }));
    expect(onNew).toHaveBeenCalledOnce();

    rerender(
      <FixturesList
        {...props({
          rows: [],
          total: 0,
          unfilteredTotal: 2,
          filter: { query: 'lamp', kind: 'all' },
        })}
      />
    );
    expect(screen.getByText('No fixtures match these filters')).toBeInTheDocument();
  });

  it('keeps the toolbar when a later page fails and provides retry', () => {
    const onRetry = vi.fn();
    render(<FixturesList {...props({ status: 'error', onRetry })} />);

    expect(
      screen.getByRole('textbox', { name: 'Filter by fixture or wired item' })
    ).toBeInTheDocument();
    expect(screen.getByText('Fixtures did not load')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('hides the toolbar until the first request succeeds', () => {
    const { rerender } = render(
      <FixturesList {...props({ hasLoaded: false, status: 'pending' })} />
    );
    expect(screen.getByLabelText('Loading fixtures')).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Filter by fixture or wired item' })
    ).not.toBeInTheDocument();

    rerender(<FixturesList {...props({ hasLoaded: false, status: 'error' })} />);
    expect(screen.getByText('Fixtures did not load')).toBeInTheDocument();
  });

  it('uses one observer per sentinel and disconnects before fetching the next page', () => {
    let callback: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();
    const observe = vi.fn();
    class TestIntersectionObserver {
      constructor(nextCallback: IntersectionObserverCallback) {
        callback = nextCallback;
      }

      disconnect = disconnect;
      observe = observe;
    }
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    const onLoadMore = vi.fn();
    render(<FixturesList {...props({ hasNextPage: true, onLoadMore })} />);

    expect(observe).toHaveBeenCalledOnce();
    callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);

    expect(onLoadMore).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    const disconnectCall = disconnect.mock.invocationCallOrder[0];
    const loadCall = onLoadMore.mock.invocationCallOrder[0];
    if (disconnectCall === undefined || loadCall === undefined) {
      throw new Error('observer callbacks were not recorded');
    }
    expect(disconnectCall).toBeLessThan(loadCall);
  });
});
