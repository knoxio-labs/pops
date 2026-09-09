import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { NumberInput } from './NumberInput';

describe('NumberInput — step="any"', () => {
  it('puts step="any" on the control so the browser imposes no precision constraint', () => {
    render(<NumberInput step="any" defaultValue={1} />);

    expect(screen.getByRole('spinbutton')).toHaveAttribute('step', 'any');
  });

  it('accepts a value finer than any fixed step without a validity error', () => {
    render(<NumberInput step="any" defaultValue={12.34} />);

    const input = screen.getByRole('spinbutton');
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect((input as HTMLInputElement).validity.stepMismatch).toBe(false);
  });

  it('still steps by 1 in both directions when no numeric step is given', async () => {
    const user = userEvent.setup();
    render(<NumberInput step="any" defaultValue={5} />);

    const [down, up] = screen.getAllByRole('button');

    await user.click(down as HTMLElement);
    expect(screen.getByRole('spinbutton')).toHaveValue(4);

    await user.click(up as HTMLElement);
    expect(screen.getByRole('spinbutton')).toHaveValue(5);
  });

  it('keeps a numeric step on the control when one is given', () => {
    render(<NumberInput step={0.5} defaultValue={1} />);

    expect(screen.getByRole('spinbutton')).toHaveAttribute('step', '0.5');
  });
});
