import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SearchBar } from './search-bar.js';

function renderBar(scope: 'inventory' | 'purchases' = 'inventory') {
  return {
    onQueryChange: vi.fn(),
    onScopeChange: vi.fn(),
    onFiltersChange: vi.fn(),
    ...render(
      <SearchBar
        query="lamp"
        scope={scope}
        counts={{ inventory: 3, purchases: 2 }}
        filters={{ typeKey: null, within: null }}
        typeOptions={[{ value: 'lighting', label: 'Lighting' }]}
        placementOptions={[{ value: 'room', label: 'Living room' }]}
        onQueryChange={vi.fn()}
        onScopeChange={vi.fn()}
        onFiltersChange={vi.fn()}
      />
    ),
  };
}

describe('SearchBar', () => {
  it('renders scope counts and writes query changes through the toolbar contract', () => {
    const onQueryChange = vi.fn();
    render(
      <SearchBar
        query="lamp"
        scope="inventory"
        counts={{ inventory: 3, purchases: 2 }}
        filters={{ typeKey: null, within: null }}
        typeOptions={[]}
        placementOptions={[]}
        onQueryChange={onQueryChange}
        onScopeChange={vi.fn()}
        onFiltersChange={vi.fn()}
      />
    );

    expect(screen.getByRole('radio', { name: /Inventory 3/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: /Purchases 2/ })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'cables' } });
    expect(onQueryChange).toHaveBeenCalledWith('cables');
  });

  it('disables inventory-only filters in the purchases scope', () => {
    renderBar('purchases');
    expect(screen.getByRole('combobox', { name: 'Filter by type' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Filter by placement' })).toBeDisabled();
  });
});
