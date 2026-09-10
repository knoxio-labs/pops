/**
 * `EndpointPicker` mounts two `KindToggle`s on one form
 * (`CreateSubstitutionForm`, `SubstitutionsFilters`). Before POPS-3272 the
 * toggle rendered bare `<input type="radio">` with no `name`, so neither
 * instance was a radio group at all — `role="radiogroup"` on the wrapper div
 * creates no native grouping, the controls contributed nothing to their
 * form, and there was no roving tab stop for arrow keys to move.
 *
 * The first two cases pin that. React's controlled `checked` hid the defect
 * from the two below them, and jsdom + `user-event` emulate radio arrow
 * navigation even for unnamed radios, so those cases pass against the
 * pre-migration component: they are regression cover for this one, not proof
 * of the fix.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { KindToggle } from './KindToggle';

import type { SubstitutionEndpointKind } from '../types';

function TwoToggles() {
  const [from, setFrom] = useState<SubstitutionEndpointKind>('ingredient');
  const [to, setTo] = useState<SubstitutionEndpointKind>('ingredient');
  return (
    <form data-testid="host-form">
      <div data-testid="from">
        <KindToggle kind={from} onChange={setFrom} />
      </div>
      <div data-testid="to">
        <KindToggle kind={to} onChange={setTo} />
      </div>
    </form>
  );
}

function radios(testId: string) {
  const scope = within(screen.getByTestId(testId));
  return {
    ingredient: scope.getByRole('radio', { name: 'Ingredient' }),
    variant: scope.getByRole('radio', { name: 'Variant' }),
  };
}

describe('KindToggle', () => {
  it('contributes one value per instance under two distinct group names', async () => {
    const user = userEvent.setup();
    render(<TwoToggles />);

    await user.click(radios('to').variant);

    const form = screen.getByTestId('host-form');
    if (!(form instanceof HTMLFormElement)) throw new Error('host is not a form');
    const entries = [...new FormData(form).entries()];

    expect(entries).toHaveLength(2);
    const [firstName, secondName] = entries.map(([name]) => name);
    expect(firstName).not.toBe(secondName);
    expect(entries.map(([, value]) => value)).toEqual(['ingredient', 'variant']);
  });

  it('gives each instance one roving tab stop rather than two plain ones', () => {
    render(<TwoToggles />);

    for (const testId of ['from', 'to']) {
      const scope = within(screen.getByTestId(testId));
      expect(scope.getByRole('radiogroup')).toHaveAttribute('tabindex', '0');
      const group = radios(testId);
      for (const item of [group.ingredient, group.variant]) {
        expect(item).toHaveAttribute('tabindex', '-1');
      }
    }
  });

  it('keeps two instances on one form independent', async () => {
    const user = userEvent.setup();
    render(<TwoToggles />);

    expect(radios('from').ingredient).toBeChecked();
    expect(radios('to').ingredient).toBeChecked();

    await user.click(radios('to').variant);

    expect(radios('to').variant).toBeChecked();
    expect(radios('to').ingredient).not.toBeChecked();
    expect(radios('from').ingredient).toBeChecked();
    expect(radios('from').variant).not.toBeChecked();
  });

  it('moves focus with arrow keys inside the group it focused', async () => {
    const user = userEvent.setup();
    render(<TwoToggles />);

    await user.click(radios('to').ingredient);
    expect(radios('to').ingredient).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(radios('to').variant).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(radios('to').ingredient).toHaveFocus();
  });
});
