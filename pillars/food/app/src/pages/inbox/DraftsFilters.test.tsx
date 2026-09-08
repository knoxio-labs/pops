/**
 * RTL coverage for the sort `<Select>` + "Clear filters" reset in
 * `DraftsFilters` — the drafts-tab filter bar this ticket migrated off
 * a raw select element.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_DRAFTS_FILTERS } from './drafts-filters.js';
import { DraftsFilters } from './DraftsFilters';

import type { DraftsFiltersState } from './drafts-filters.js';

function t(key: string): string {
  const labels: Record<string, string> = {
    'inbox.drafts.filters.band': 'Quality',
    'inbox.filters.kind': 'Kind',
    'inbox.drafts.filters.partialReason': 'Partial',
    'inbox.drafts.filters.freshOnly': 'Fresh only (last 24h)',
    'inbox.drafts.filters.sort': 'Sort',
    'inbox.filters.clear': 'Clear filters',
    'inbox.drafts.sort.quality-asc': 'Worst first',
    'inbox.drafts.sort.quality-desc': 'Cleanest first',
    'inbox.drafts.sort.oldest': 'Oldest first',
    'inbox.drafts.sort.newest': 'Newest first',
  };
  return labels[key] ?? key;
}

describe('DraftsFilters', () => {
  it('changes sort via the kit Select and the Clear button resets it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClear = vi.fn();
    let value: DraftsFiltersState = { ...DEFAULT_DRAFTS_FILTERS };
    function Wrapper() {
      return (
        <DraftsFilters
          value={value}
          onChange={(next) => {
            value = next;
            onChange(next);
          }}
          onClear={() => {
            value = { ...DEFAULT_DRAFTS_FILTERS };
            onClear();
          }}
          t={t}
        />
      );
    }
    const { rerender } = render(<Wrapper />);

    const sortSelect = screen.getByTestId('drafts-sort');
    expect(sortSelect).toHaveValue(DEFAULT_DRAFTS_FILTERS.sort);

    await user.selectOptions(sortSelect, 'Newest first');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sort: 'newest' }));
    rerender(<Wrapper />);
    expect(screen.getByTestId('drafts-sort')).toHaveValue('newest');

    await user.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
    rerender(<Wrapper />);
    expect(screen.getByTestId('drafts-sort')).toHaveValue(DEFAULT_DRAFTS_FILTERS.sort);
  });
});
