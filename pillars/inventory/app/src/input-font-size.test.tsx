import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NameInput } from './foundation/places/name-input.js';
import { ContentsFilter } from './pages/item-detail/container/contents-flow.js';
import { SearchFilterControls } from './pages/search/search-filter-controls.js';

describe('Inventory editable controls', () => {
  it('keeps the search filters at 16px on narrow screens and preserves their compact desktop size', () => {
    render(
      <SearchFilterControls
        scope="inventory"
        filters={{ typeKey: null, within: null }}
        typeOptions={[]}
        placementOptions={[]}
        onFiltersChange={vi.fn()}
      />
    );

    for (const name of ['Filter by type', 'Filter by placement']) {
      expect(screen.getByRole('combobox', { name })).toHaveClass('text-base', 'md:text-xs');
    }
  });

  it('keeps the inline place editor and contents filter at 16px on narrow screens', () => {
    render(
      <>
        <NameInput label="Place name" onCommit={vi.fn(() => null)} onCancel={vi.fn()} />
        <ContentsFilter name="Box" query="" onQuery={vi.fn()} />
      </>
    );

    expect(screen.getByRole('textbox', { name: 'Place name' })).toHaveClass(
      'text-base',
      'md:text-sm'
    );
    expect(screen.getByRole('textbox', { name: 'Filter what is in Box' })).toHaveClass(
      'text-base',
      'md:text-sm'
    );
  });
});
