import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { AddContactPoint } from './AddFact';

import type { ContactPointInput } from '../contacts-api/types.gen';

it('sends phone country only when explicitly supplied and retains rejected fields', async () => {
  const user = userEvent.setup();
  const add = vi.fn<(point: ContactPointInput) => Promise<boolean>>().mockResolvedValue(false);
  render(<AddContactPoint disabled={false} onAdd={add} />);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'phone');
  await user.type(screen.getByRole('textbox', { name: 'Contact value' }), '0412 555 018');
  await user.click(screen.getByRole('button', { name: 'Add contact method' }));
  expect(add).toHaveBeenLastCalledWith({
    kind: 'phone',
    value: '0412 555 018',
    label: null,
    countryCode: null,
  });
  expect(screen.getByRole('textbox', { name: 'Contact value' })).toHaveValue('0412 555 018');
  await user.type(screen.getByRole('textbox', { name: 'Phone country (optional ISO code)' }), 'AU');
  await user.click(screen.getByRole('button', { name: 'Add contact method' }));
  expect(add).toHaveBeenLastCalledWith({
    kind: 'phone',
    value: '0412 555 018',
    label: null,
    countryCode: 'AU',
  });
  await user.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'social');
  await user.click(screen.getByRole('button', { name: 'Add contact method' }));
  expect(add).toHaveBeenLastCalledWith({
    kind: 'social',
    value: '0412 555 018',
    label: null,
    countryCode: null,
  });
});
