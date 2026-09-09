import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { RadioInput } from './RadioInput';

const options = [
  { label: 'Free', value: 'free' },
  { label: 'Pro', value: 'pro' },
];

function TwoGroups() {
  return (
    <>
      <RadioInput label="Plan A" options={options} />
      <RadioInput label="Plan B" options={options} />
    </>
  );
}

describe('RadioInput — id scoping', () => {
  it('gives two groups sharing an option value distinct ids', () => {
    render(<TwoGroups />);

    const ids = screen.getAllByRole('radio').map((radio) => radio.getAttribute('id'));

    expect(ids.every((id) => id !== null && id !== '')).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points each option's label at its own group's radio", async () => {
    const user = userEvent.setup();
    render(<TwoGroups />);

    const radios = screen.getAllByRole('radio');
    const firstFree = radios[0];
    const secondFree = radios[2];
    const secondGroupLabel = screen.getAllByText('Free')[1];
    if (!secondGroupLabel) throw new Error('expected a second group');

    await user.click(secondGroupLabel);

    expect(secondFree).toBeChecked();
    expect(firstFree).not.toBeChecked();
  });
});
