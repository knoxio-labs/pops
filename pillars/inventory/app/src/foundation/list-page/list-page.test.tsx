import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSelection } from '../selection/use-selection';
import { ShortcutProvider } from '../shortcuts/shortcut-provider';
import { ItemsSummary } from './items-summary';
import { ItemsToolbar } from './items-toolbar';
import { useListPageKeys } from './use-list-page-keys';

import type { ReactElement } from 'react';

import type { ItemsUrlFilters } from '../../inventory-web/items-url-filters';
import type { ItemRowModel } from '../model/model';

const filters: ItemsUrlFilters = {
  q: 'snorkel',
  typeKey: 'cable',
  untyped: false,
  inactive: false,
  within: null,
  sort: 'name',
  view: 'cards',
};

const row: ItemRowModel = {
  id: 'item-1',
  name: 'Kitchen 13',
  typeId: null,
  typeName: null,
  code: 'K13',
  quantity: 1,
  container: null,
  lifecycle: 'active',
  placement: { kind: 'in-hand' },
  previous: null,
  sync: 'synced',
  photoUrl: null,
  note: null,
  updatedAt: '2026-09-20T09:00:00.000Z',
};

function renderToolbar(
  props: Partial<{
    filters: ItemsUrlFilters;
    onClear: () => void;
    onFilters: (patch: Partial<ItemsUrlFilters>) => void;
    onView: (view: ItemsUrlFilters['view']) => void;
    scope: 'items' | 'containers';
  }> = {}
): void {
  render(
    <ItemsToolbar
      filters={props.filters ?? filters}
      types={[{ value: 'cable', label: 'Cable' }]}
      places={[{ value: 'garage', label: 'Garage' }]}
      onFilters={props.onFilters ?? vi.fn()}
      onClear={props.onClear ?? vi.fn()}
      onView={props.onView}
      scope={props.scope}
    />
  );
}

function LocationProbe(): ReactElement {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function KeyHarness({ extra }: { extra: Record<string, () => boolean> }): ReactElement {
  const selection = useSelection([row.id]);
  useListPageKeys({ rows: [row], selection, extra });
  return (
    <div role="grid">
      <button type="button" onClick={() => selection.onRowToggle(row.id, false)}>
        focus row
      </button>
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('list page foundation', () => {
  it('the filter button shows the active count and Clear filters keeps the text', () => {
    const onClear = vi.fn();
    renderToolbar({ onClear });
    expect(screen.getByRole('button', { name: /Filter/u })).toHaveTextContent('1');
    expect(screen.getByRole('textbox', { name: 'Filter this list' })).toHaveValue('snorkel');

    fireEvent.click(screen.getByRole('button', { name: /Filter/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.getByRole('textbox', { name: 'Filter this list' })).toHaveValue('snorkel');
  });

  it('the containers scope hides the untyped and inactive controls', () => {
    renderToolbar({ scope: 'containers' });
    fireEvent.click(screen.getByRole('button', { name: /Filter/u }));

    expect(screen.queryByText('Only items with no type yet')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Include retired, discarded, lost and destroyed')
    ).not.toBeInTheDocument();
  });

  it('without onView there is no view toggle and no Sort select', () => {
    renderToolbar();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Sort by' })).not.toBeInTheDocument();
  });

  it('the summary counts shown of total and the inactive rows left out', () => {
    const { rerender } = render(
      <ItemsSummary
        shown={12}
        total={40}
        hiddenInactive={3}
        noun="items"
        chips={[]}
        href="/inventory/items"
      />
    );
    expect(screen.getByText('12 of 40 items, 3 inactive not shown')).toBeInTheDocument();

    rerender(
      <ItemsSummary
        shown={40}
        total={40}
        hiddenInactive={0}
        noun="items"
        chips={[]}
        href="/inventory/items"
      />
    );
    expect(screen.getByText('40 items')).toBeInTheDocument();
  });

  it("Copy link writes the view's URL", () => {
    const writeText = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(
      <ItemsSummary
        shown={1}
        total={1}
        hiddenInactive={0}
        noun="items"
        chips={[]}
        href="/inventory/items?q=K13"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy link to this view' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/inventory/items?q=K13`);
  });

  it('useListPageKeys merges extra handlers into one list scope', () => {
    const pickUp = vi.fn(() => true);
    render(
      <MemoryRouter initialEntries={['/inventory/items']}>
        <ShortcutProvider globalHandlers={{}}>
          <KeyHarness extra={{ 'pick-up': pickUp }} />
          <LocationProbe />
        </ShortcutProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'focus row' }));
    fireEvent.keyDown(window, { key: 'p' });
    fireEvent.keyDown(window, { key: 'e' });

    expect(pickUp).toHaveBeenCalledOnce();
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/items/item-1/edit');
  });
});
