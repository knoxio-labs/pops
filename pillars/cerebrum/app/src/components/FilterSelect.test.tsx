/**
 * Regression test for the "All" clear semantics: FilterSelect must model
 * "all" as a normal, re-selectable option rather than kit Select's
 * `placeholder` (which renders a disabled option a user could never pick
 * again once a real value was chosen).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { FilterSelect } from './FilterSelect';

function Harness() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <FilterSelect
      label="Status"
      value={value}
      options={['active', 'archived']}
      emptyLabel="All statuses"
      onChange={setValue}
    />
  );
}

describe('FilterSelect', () => {
  it('renders the empty option alongside the provided options', () => {
    render(<Harness />);
    const select = screen.getByLabelText('Status') as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual(['All statuses', 'active', 'archived']);
  });

  it('can be cleared back to "All" after a value has been chosen', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const select = screen.getByLabelText('Status') as HTMLSelectElement;

    await user.selectOptions(select, 'active');
    expect(select.value).toBe('active');

    await user.selectOptions(select, 'All statuses');
    expect(select.value).toBe('');
  });
});
