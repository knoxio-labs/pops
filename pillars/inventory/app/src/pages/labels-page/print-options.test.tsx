import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { StartAtControl } from './print-options';
import { useLabelJob } from './useLabelJob';

function StartAtHarness() {
  const job = useLabelJob([], { sheetId: null });
  return <StartAtControl job={job} />;
}

describe('StartAtControl', () => {
  beforeEach(() => localStorage.clear());

  it('keeps a cleared draft editable without inserting the clamped value', async () => {
    const user = userEvent.setup();
    render(<StartAtHarness />);
    const input = screen.getByRole('spinbutton', { name: 'Start at label' });
    await user.clear(input);
    expect(input).toHaveValue(null);
    await user.type(input, '2');
    expect(input).toHaveValue(2);
    expect(input).toHaveFocus();
    await user.tab();
    expect(input).toHaveValue(2);
  });

  it('clamps an out-of-range draft when leaving the field', async () => {
    const user = userEvent.setup();
    render(<StartAtHarness />);
    const input = screen.getByRole('spinbutton', { name: 'Start at label' });
    await user.click(input);
    fireEvent.change(input, { target: { value: '0' } });
    expect(input).toHaveValue(0);
    await user.tab();
    expect(input).toHaveValue(1);
  });
});
