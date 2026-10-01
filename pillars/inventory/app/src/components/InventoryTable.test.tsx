import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { INVENTORY_CONDITIONS } from '@pops/inventory';

import { InventoryTable, type InventoryTableItem } from './InventoryTable';

function renderTable(
  items: InventoryTableItem[],
  locationPathMap?: ReadonlyMap<string, { id: string; name: string }[]>
) {
  return render(
    <MemoryRouter>
      <InventoryTable items={items} locationPathMap={locationPathMap} />
    </MemoryRouter>
  );
}

const baseItem: InventoryTableItem = {
  id: 'item-1',
  itemName: 'MacBook Pro',
  brand: 'Apple',
  type: 'Electronics',
  condition: null,
  location: null,
  locationId: null,
  replacementValue: null,
  purchaseDate: null,
  inUse: true,
  assetId: null,
};

function firstRowConditionCell() {
  const conditionColumnIndex = screen
    .getAllByRole('columnheader')
    .findIndex((header) => header.textContent?.trim() === 'Condition');
  const firstDataRow = screen.getAllByRole('row')[1];
  return firstDataRow?.querySelectorAll('td').item(conditionColumnIndex);
}

// ---------------------------------------------------------------------------
// Condition badge colour mapping
// ---------------------------------------------------------------------------

describe('Condition column — badge colour mapping', () => {
  it.each([
    ['new', 'new'],
    ['good', 'good'],
    ['fair', 'fair'],
    ['poor', 'poor'],
    ['broken', 'broken'],
  ] as const)('renders badge for condition "%s"', (condition, expected) => {
    renderTable([{ ...baseItem, condition }]);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it.each(INVENTORY_CONDITIONS)('renders badge for contract condition "%s"', (condition) => {
    renderTable([{ ...baseItem, condition }]);
    expect(screen.getByText(condition)).toBeInTheDocument();
  });

  it('renders dash for null condition', () => {
    renderTable([{ ...baseItem, condition: null }]);
    expect(firstRowConditionCell()).toHaveTextContent('—');
  });

  it('renders a dash for unknown condition strings', () => {
    renderTable([{ ...baseItem, condition: 'mint' }]);
    expect(firstRowConditionCell()).toHaveTextContent('—');
  });
});

// ---------------------------------------------------------------------------
// Location column — breadcrumb rendering
// ---------------------------------------------------------------------------

describe('Location column — breadcrumb rendering', () => {
  it('renders breadcrumb path when locationId matches locationPathMap', () => {
    const map = new Map([
      [
        'loc-shelf',
        [
          { id: 'loc-home', name: 'Home' },
          { id: 'loc-living', name: 'Living Room' },
          { id: 'loc-shelf', name: 'Shelf' },
        ],
      ],
    ]);

    renderTable([{ ...baseItem, locationId: 'loc-shelf', location: null }], map);

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Living Room')).toBeInTheDocument();
    expect(screen.getByText('Shelf')).toBeInTheDocument();
  });

  it('renders full path as tooltip on the breadcrumb wrapper', () => {
    const map = new Map([
      [
        'loc-shelf',
        [
          { id: 'loc-home', name: 'Home' },
          { id: 'loc-shelf', name: 'Shelf' },
        ],
      ],
    ]);

    renderTable([{ ...baseItem, locationId: 'loc-shelf', location: null }], map);

    const wrapper = screen.getByTitle('Home > Shelf');
    expect(wrapper).toBeInTheDocument();
  });

  it('falls back to legacy free-text location when locationId has no map entry', () => {
    const map = new Map<string, { id: string; name: string }[]>();

    renderTable([{ ...baseItem, locationId: 'loc-unknown', location: 'Old Office' }], map);

    expect(screen.getByText('Old Office')).toBeInTheDocument();
  });

  it('renders dash when locationId is null and no location text', () => {
    renderTable([{ ...baseItem, locationId: null, location: null }]);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders single-segment breadcrumb', () => {
    const map = new Map([['loc-room', [{ id: 'loc-room', name: 'Storage' }]]]);

    renderTable([{ ...baseItem, locationId: 'loc-room' }], map);

    expect(screen.getByText('Storage')).toBeInTheDocument();
  });

  it('falls back to dash when no locationPathMap and location is null', () => {
    renderTable([{ ...baseItem, locationId: null, location: null }]);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Null field handling
// ---------------------------------------------------------------------------

describe('Null field handling', () => {
  it('renders dash for null brand', () => {
    renderTable([{ ...baseItem, brand: null }]);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders dash for null replacementValue', () => {
    renderTable([{ ...baseItem, replacementValue: null }]);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders dash for null purchaseDate', () => {
    renderTable([{ ...baseItem, purchaseDate: null }]);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders item name', () => {
    renderTable([{ ...baseItem }]);
    expect(screen.getByText('MacBook Pro')).toBeInTheDocument();
  });

  it('renders formatted replacement value', () => {
    renderTable([{ ...baseItem, replacementValue: 2500 }]);
    expect(screen.getByText(/2,500/)).toBeInTheDocument();
  });

  it('renders formatted purchase date', () => {
    renderTable([{ ...baseItem, purchaseDate: '2024-06-15' }]);
    // Date formatting is locale-dependent; check something non-empty renders
    const dateCell = screen.getByText(/2024/);
    expect(dateCell).toBeInTheDocument();
  });
});

describe('Row selection', () => {
  function renderSelectable(onSelectionChange: (ids: string[]) => void) {
    return render(
      <MemoryRouter initialEntries={['/inventory']}>
        <Routes>
          <Route
            path="/inventory"
            element={
              <InventoryTable
                items={[baseItem, { ...baseItem, id: 'item-2', itemName: 'Kettle' }]}
                onSelectionChange={onSelectionChange}
              />
            }
          />
          <Route path="/inventory/items/:id" element={<p>Detail page</p>} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('offers no checkboxes unless the caller wants the selection', () => {
    renderTable([baseItem]);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('reports ticked items by id without opening the row', async () => {
    const onSelectionChange = vi.fn();
    renderSelectable(onSelectionChange);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Kettle' }));
    await waitFor(() => expect(onSelectionChange).toHaveBeenLastCalledWith(['item-2']));
    expect(screen.queryByText('Detail page')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all items on this page' }));
    await waitFor(() => expect(onSelectionChange).toHaveBeenLastCalledWith(['item-1', 'item-2']));
  });
});
