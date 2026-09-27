import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { ResultsList } from './results-list.js';

import type { ItemRowModel, LocationModel } from '../../foundation/model/model.js';
import type { WebSearchResults } from '../../inventory-web/useWebSearch.js';

function item(id: string): ItemRowModel {
  return {
    id,
    name: id,
    typeId: null,
    typeName: null,
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement: { kind: 'in-hand' },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function place(id: string): LocationModel {
  return { id, name: id, parentId: null, kind: 'room' };
}

function props() {
  const exact = item('exact');
  const prefix = item('prefix');
  const other = item('other');
  const location = place('place');
  const results: WebSearchResults = {
    exact,
    items: [
      { kind: 'item', item: prefix, tier: 'prefix', field: 'type' },
      { kind: 'item', item: other, tier: 'other', field: 'note' },
    ],
    places: [{ kind: 'place', place: location, tier: 'contains' }],
    total: 4,
  };
  return {
    query: 'e',
    results,
    world: buildWorld([exact, prefix, other], [location]),
    activeId: 'prefix',
    checkedIds: new Set<string>(),
    hasNextPage: true,
    isFetchingNextPage: false,
    onKeyDown: vi.fn(),
    onActivate: vi.fn(),
    onOpen: vi.fn(),
    onToggle: vi.fn(),
    onPickUp: vi.fn(),
    onPutBack: vi.fn(),
    onMove: vi.fn(),
    onFetchNextPage: vi.fn(),
  };
}

describe('ResultsList', () => {
  it('exposes listbox semantics, server-ranked rows, and the infinite sentinel', () => {
    render(<ResultsList {...props()} />);

    const list = screen.getByRole('listbox', { name: 'Inventory search results' });
    expect(list).toHaveAttribute('aria-activedescendant', 'search-result-item-prefix');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      expect.stringContaining('Exact code'),
      expect.stringContaining('prefix'),
      expect.stringContaining('place'),
      expect.stringContaining('other'),
    ]);
    expect(screen.getByTestId('search-infinite-sentinel')).toBeInTheDocument();
  });

  it('keeps selection controls separate from active preview state', () => {
    const view = props();
    view.checkedIds = new Set(['prefix']);
    render(<ResultsList {...view} />);

    expect(screen.getByRole('checkbox', { name: 'Select prefix' })).toBeChecked();
    expect(screen.getByRole('option', { name: /prefix/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders an exact item only in the exact-code section', () => {
    const view = props();
    const exact = view.results.exact;
    if (exact === null) throw new Error('test fixture must contain an exact result');
    view.results = {
      ...view.results,
      items: [{ kind: 'item', item: exact, tier: 'prefix', field: 'code' }, ...view.results.items],
    };

    render(<ResultsList {...view} />);

    expect(document.querySelectorAll('#search-result-item-exact')).toHaveLength(1);
  });
});
