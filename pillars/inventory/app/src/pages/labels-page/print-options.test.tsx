import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { StartAtControl } from './print-options';
import { useLabelJob } from './useLabelJob';

function StartAtHarness() {
  const job = useLabelJob([], { sheetId: null });
  return (
    <>
      <StartAtControl job={job} />
      <button type="button" onClick={() => job.setStartAt(3)}>
        Choose label 3
      </button>
    </>
  );
}

describe('StartAtControl', () => {
  beforeEach(() => localStorage.clear());

  it('reflects an external position after an unfocused stepper change', async () => {
    const user = userEvent.setup();
    render(<StartAtHarness />);
    const input = screen.getByRole('spinbutton', { name: 'Start at label' });
    const increment = screen.getAllByRole('button', { name: '' })[1];
    if (increment === undefined) throw new Error('The increment stepper is missing.');
    await user.click(increment);
    expect(input).toHaveValue(2);
    expect(input).not.toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Choose label 3' }));
    expect(input).toHaveValue(3);
  });

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
    await user.clear(input);
    await user.type(input, '0');
    expect(input).toHaveValue(0);
    await user.tab();
    expect(input).toHaveValue(1);
  });
});
