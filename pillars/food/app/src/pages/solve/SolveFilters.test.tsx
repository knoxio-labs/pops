/**
 * RTL coverage for the max-time filter in `SolveFilters`.
 *
 * The kit `Select` renders a `placeholder` prop as a disabled option that
 * can't be re-selected once left — modeling "Any" as a normal option with
 * value `''` is what keeps this filter clearable. This suite proves the
 * "any" option is present, always selectable, and round-trips back to
 * `maxMinutes: null`.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SolveFilters } from './SolveFilters';

import type { SolveFilterState } from './useSolveResult.js';

function baseFilters(overrides: Partial<SolveFilterState> = {}): SolveFilterState {
  return {
    excludeSubs: false,
    recipeTypes: [],
    tags: [],
    maxMinutes: null,
    ...overrides,
  };
}

describe('SolveFilters tags', () => {
  it('commits a comma-typed tag without blurring the field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SolveFilters filters={baseFilters()} onChange={onChange} />);

    const field = screen.getByLabelText(/tags/i);
    await user.click(field);
    await user.keyboard('spicy,');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tags: ['spicy'] }));
    expect(document.activeElement).toBe(field);
  });

  it('takes an externally reset value without replacing the field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <SolveFilters filters={baseFilters({ tags: ['spicy'] })} onChange={onChange} />
    );

    const field = screen.getByLabelText(/tags/i);
    await user.click(field);
    expect(document.activeElement).toBe(field);

    rerender(<SolveFilters filters={baseFilters({ tags: [] })} onChange={onChange} />);

    expect(screen.getByLabelText(/tags/i)).toBe(field);
    expect(document.activeElement).toBe(field);
  });
});

describe('SolveFilters max-time select', () => {
  it('renders the "Any" choice as an enabled, selectable option', () => {
    render(<SolveFilters filters={baseFilters()} onChange={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: /max time/i });
    const anyOption = screen.getByRole('option', { name: 'Any' }) as HTMLOptionElement;
    expect(anyOption.disabled).toBe(false);
    expect(select).toHaveValue('');
  });

  it('clears maxMinutes back to null after a time limit was chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <SolveFilters filters={baseFilters({ maxMinutes: 30 })} onChange={onChange} />
    );
    const select = screen.getByRole('combobox', { name: /max time/i });
    expect(select).toHaveValue('30');

    await user.selectOptions(select, 'Any');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxMinutes: null }));

    // Re-render with the cleared state to prove the "Any" option is still
    // selectable — not stuck disabled the way a `placeholder` prop would
    // leave it once a real value had been chosen.
    rerender(<SolveFilters filters={baseFilters({ maxMinutes: null })} onChange={onChange} />);
    expect(select).toHaveValue('');
    const anyOption = screen.getByRole('option', { name: 'Any' }) as HTMLOptionElement;
    expect(anyOption.disabled).toBe(false);
  });
});
