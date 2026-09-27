import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
    filter: { q: '', kind: null },
    locations: [],
    status: 'success',
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
  it('renders server room and wired summaries and exposes open/edit actions', () => {
    const view = props();
    render(<FixturesList {...view} />);

    expect(screen.getByText('Desk outlet')).toBeInTheDocument();
    expect(screen.queryByText('Nothing wired')).not.toBeInTheDocument();
    expect(screen.getByText('Lamp')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Desk outlet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Desk outlet' }));
    expect(view.onOpen).toHaveBeenCalledWith('fixture-1');
    expect(view.onEdit).toHaveBeenCalledWith(view.rows[0]);
  });

  it('passes query and kind changes to the page model without filtering rows locally', () => {
    const view = props();
    render(<FixturesList {...view} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter fixtures' }), {
      target: { value: 'lamp' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Fixture kind' }), {
      target: { value: 'light' },
    });

    expect(view.onFilterChange).toHaveBeenNthCalledWith(1, { q: 'lamp' });
    expect(view.onFilterChange).toHaveBeenNthCalledWith(2, { kind: 'light' });
    expect(screen.getByText('Desk outlet')).toBeInTheDocument();
  });

  it('distinguishes first-use empty and filtered-empty states', () => {
    const onNew = vi.fn();
    const { rerender } = render(<FixturesList {...props({ rows: [], total: 0, onNew })} />);
    expect(screen.getByText('No fixtures recorded')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New fixture' }));
    expect(onNew).toHaveBeenCalledOnce();

    rerender(
      <FixturesList {...props({ rows: [], total: 0, filter: { q: 'lamp', kind: null } })} />
    );
    expect(screen.getByText('No fixtures match these filters')).toBeInTheDocument();
  });

  it('renders loading and retryable error states', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<FixturesList {...props({ status: 'pending' })} />);
    expect(screen.getByLabelText('Loading fixtures')).toBeInTheDocument();

    rerender(<FixturesList {...props({ status: 'error', onRetry })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
