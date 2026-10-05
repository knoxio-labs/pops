import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AcceptEntityButton } from './AcceptEntityButton';

import type { EntityExistence } from './entity-existence';

const EXPLANATIONS: Record<EntityExistence, string> = {
  existing: '"Woolworths" already exists — these transactions are assigned to it',
  new: '"Woolworths" does not exist yet — accepting creates it',
  checking: 'Checking Contacts to determine whether accepting creates an entity',
  unavailable:
    'Contacts is unavailable, so POPS cannot determine whether accepting creates an entity',
};

const CASES = [
  ['existing', EXPLANATIONS.existing],
  ['new', EXPLANATIONS.new],
  ['checking', EXPLANATIONS.checking],
  ['unavailable', EXPLANATIONS.unavailable],
] satisfies Array<[EntityExistence, string]>;

function renderButton(existence: EntityExistence) {
  return render(
    <AcceptEntityButton
      existence={existence}
      scope="one"
      entityName="Woolworths"
      onClick={() => {}}
    />
  );
}

describe('AcceptEntityButton explanation', () => {
  it.each(CASES)('shows the %s explanation on keyboard focus', async (existence, explanation) => {
    const user = userEvent.setup();
    renderButton(existence);
    const disabled = existence === 'checking' || existence === 'unavailable';
    const trigger = disabled
      ? screen.getByRole('button', { name: /^About / })
      : screen.getByRole('button');

    await user.tab();

    expect(trigger).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(explanation);
  });

  it.each(CASES)(
    'keeps the %s explanation available on pointer hover',
    async (existence, explanation) => {
      const user = userEvent.setup();
      renderButton(existence);
      const disabled = existence === 'checking' || existence === 'unavailable';
      const trigger = disabled
        ? screen.getByRole('button', { name: /^About / })
        : screen.getByRole('button');

      if (disabled)
        expect(
          screen.getAllByRole('button').some((button) => button.hasAttribute('disabled'))
        ).toBe(true);
      await user.hover(trigger);

      expect(await screen.findByRole('tooltip')).toHaveTextContent(explanation);
    }
  );

  it.each(['checking', 'unavailable'] as const)(
    'does not accept while entity verification is %s',
    async (existence) => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <AcceptEntityButton
          existence={existence}
          scope="one"
          entityName="Woolworths"
          onClick={onClick}
        />
      );

      const actionButton = screen
        .getAllByRole('button')
        .find((button) => button.hasAttribute('disabled'));
      if (!actionButton) throw new Error('Disabled accept action is missing');
      await user.click(actionButton);

      expect(onClick).not.toHaveBeenCalled();
    }
  );

  it.each(['checking', 'unavailable'] as const)(
    'shows the %s explanation when hovering the disabled accept button',
    async (existence) => {
      const user = userEvent.setup();
      renderButton(existence);
      const actionButton = screen
        .getAllByRole('button')
        .find((button) => button.hasAttribute('disabled'));
      if (!actionButton?.parentElement)
        throw new Error('Disabled accept action has no tooltip target');

      await user.hover(actionButton.parentElement);

      expect(await screen.findByRole('tooltip')).toHaveTextContent(EXPLANATIONS[existence]);
    }
  );
});
