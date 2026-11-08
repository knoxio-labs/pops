import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';

import { ContactError } from '../errors';
import { PersonPanel } from './PersonPanel';
import { personSnapshot, personTestGateway } from './test-fixtures';

import type { PersonGateway, PersonSnapshot } from './contracts';

function mount(gateway: PersonGateway) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <PersonPanel id="person" gateway={gateway} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

it('shows loading then repeatable original details before notes with explicit provenance', async () => {
  let finish: (data: PersonSnapshot) => void = () => {
    throw new Error('Load not started');
  };
  mount({
    ...personTestGateway(),
    load: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  expect(screen.getByLabelText('Loading person')).toBeVisible();
  await act(async () => finish(personSnapshot()));
  expect(await screen.findByDisplayValue('Marina Duarte')).toBeVisible();
  expect(screen.getByText('Marina@Example.test')).toBeVisible();
  expect(screen.getByText('Personal account')).toBeVisible();
  expect(screen.getByText('Inactive source')).toBeVisible();
  expect(screen.getByText('Preferred')).toBeVisible();
  expect(screen.getByText('Local')).toBeVisible();
  expect(screen.queryByText(/Phone country:/)).not.toBeInTheDocument();
  expect(
    screen.getAllByRole('region').map((section) => section.getAttribute('aria-label'))
  ).toEqual(['Contact methods', 'Addresses', 'Notes']);
});

it('undoes unsaved edits and saves only the current name and notes', async () => {
  const user = userEvent.setup();
  const gateway = personTestGateway();
  const save = vi.fn(gateway.save);
  mount({ ...gateway, save });
  const name = await screen.findByRole('textbox', { name: 'Person name' });
  await user.type(name, 'x');
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(name).toHaveValue('Marina Duarte');
  expect(screen.getByRole('button', { name: 'Save details' })).toBeDisabled();
  await user.type(name, ' Jr');
  await user.clear(screen.getByRole('textbox', { name: 'Notes' }));
  await user.click(screen.getByRole('button', { name: 'Save details' }));
  expect(save).toHaveBeenCalledExactlyOnceWith('person', { name: 'Marina Duarte Jr', notes: '' });
  expect(await screen.findByText('Saved to Contacts.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

it('preserves failed drafts and blocks another uncertain create until a successful reload', async () => {
  const user = userEvent.setup();
  const load = vi.fn(personTestGateway().load);
  const addAddress = vi
    .fn<PersonGateway['addAddress']>()
    .mockRejectedValue(new ContactError('network', 'contacts.network'));
  mount({ ...personTestGateway(), load, addAddress });
  await screen.findByDisplayValue('Marina Duarte');
  await user.type(screen.getByRole('textbox', { name: 'Person name' }), ' Jr');
  await user.type(screen.getByRole('textbox', { name: 'Address' }), 'New address');
  await user.click(screen.getByRole('button', { name: 'Add address' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('contacts.network');
  expect(screen.getByRole('textbox', { name: 'Address' })).toHaveValue('New address');
  expect(screen.getByRole('button', { name: 'Add address' })).toBeDisabled();
  load.mockRejectedValueOnce(new ContactError('service', 'contacts.http.500'));
  await user.click(screen.getByRole('button', { name: 'Reload person' }));
  expect(await screen.findByText(/contacts.http.500/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Add address' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Reload person' }));
  expect(await screen.findByRole('button', { name: 'Add address' })).toBeEnabled();
  expect(screen.getByRole('textbox', { name: 'Person name' })).toHaveValue('Marina Duarte Jr');
  expect(addAddress).toHaveBeenCalledTimes(1);
});

it('adds a labeled raw email and an address using server receipts without losing other observations', async () => {
  const user = userEvent.setup();
  const data = personSnapshot();
  const existingPoint = data.points[0];
  const existingAddress = data.addresses[0];
  if (!existingPoint || !existingAddress) throw new Error('Missing fixture');
  const addPoint = vi.fn<PersonGateway['addPoint']>().mockResolvedValue({
    ...existingPoint,
    id: 'new-point',
    value: 'New@Example.test',
    label: 'Home',
    sourceRecordId: null,
    active: true,
    preferred: false,
  });
  const addAddress = vi
    .fn<PersonGateway['addAddress']>()
    .mockResolvedValue({ ...existingAddress, id: 'new-address', value: 'New raw address' });
  mount({ ...personTestGateway(), addPoint, addAddress });
  await screen.findByDisplayValue('Marina Duarte');
  await user.type(screen.getByRole('textbox', { name: 'Label' }), 'Home');
  await user.type(screen.getByRole('textbox', { name: 'Contact value' }), 'New@Example.test');
  await user.click(screen.getByRole('button', { name: 'Add contact method' }));
  expect(addPoint).toHaveBeenCalledExactlyOnceWith('person', {
    kind: 'email',
    value: 'New@Example.test',
    label: 'Home',
    countryCode: null,
  });
  expect(await screen.findByText('New@Example.test')).toBeVisible();
  expect(screen.getByText('Marina@Example.test')).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Contact value' })).toHaveValue('');
  await user.type(screen.getByRole('textbox', { name: 'Address' }), 'New raw address');
  await user.click(screen.getByRole('button', { name: 'Add address' }));
  expect(addAddress).toHaveBeenCalledExactlyOnceWith('person', 'New raw address');
  expect(await screen.findByText('New raw address')).toBeVisible();
});

it('renders empty facts and lets a failed initial load recover without an editor on stale error data', async () => {
  const user = userEvent.setup();
  const data = { ...personSnapshot(), points: [], addresses: [] };
  const load = vi
    .fn<PersonGateway['load']>()
    .mockRejectedValueOnce(new ContactError('notFound', 'contacts.http.404'))
    .mockResolvedValue(data);
  mount({ ...personTestGateway(data), load });
  expect(await screen.findByRole('alert')).toHaveTextContent('contacts.http.404');
  expect(screen.queryByRole('textbox', { name: 'Person name' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Reload person' }));
  expect(await screen.findByText('No contact methods yet.')).toBeVisible();
  expect(screen.getByText('No addresses yet.')).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Contact methods' })).getByRole('button', {
      name: 'Add contact method',
    })
  ).toBeDisabled();
});
