/**
 * RTL coverage for `RecipeListFilters`'s sort `<Select>` + the "Clear
 * filters" reset, which together are this filter bar's only way back to
 * `DEFAULT_FILTERS` once a sort other than the default has been picked.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_FILTERS } from './recipe-list-types.js';
import { RecipeListFilters } from './RecipeListFilters';

import type { RecipeListFilterState } from './recipe-list-types.js';

describe('RecipeListFilters', () => {
  it('changes sort via the kit Select and clears back to the default', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    let value: RecipeListFilterState = { ...DEFAULT_FILTERS };
    function Wrapper() {
      return (
        <RecipeListFilters
          value={value}
          onChange={(next) => {
            value = next;
            onChange(next);
          }}
          availableTags={[]}
        />
      );
    }
    const { rerender } = render(<Wrapper />);

    const sortSelect = screen.getByRole('combobox', { name: /sort/i });
    expect(sortSelect).toHaveValue(DEFAULT_FILTERS.sort);

    await user.selectOptions(sortSelect, 'Title (A-Z)');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sort: 'titleAsc' }));
    rerender(<Wrapper />);
    expect(screen.getByRole('combobox', { name: /sort/i })).toHaveValue('titleAsc');

    const clearButton = screen.getByRole('button', { name: /clear filters/i });
    await user.click(clearButton);
    expect(onChange).toHaveBeenCalledWith(DEFAULT_FILTERS);
    rerender(<Wrapper />);
    expect(screen.getByRole('combobox', { name: /sort/i })).toHaveValue(DEFAULT_FILTERS.sort);
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
  });
});
