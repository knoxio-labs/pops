import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';

import { ContactError } from '../errors';
import { PersonPanel } from './PersonPanel';
import { personSnapshot, personTestGateway } from './test-fixtures';

import type { PersonGateway } from './contracts';

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

it('shows methods and literal addresses before notes with source evidence and direct editable fields', async () => {
  mount(personTestGateway());
  await screen.findByDisplayValue('Marina Duarte');
  expect(screen.getByDisplayValue('Marina@Example.test')).toBeVisible();
  expect(screen.getByText('Personal account')).toBeVisible();
  expect(screen.getByText('Inactive source')).toBeVisible();
  expect(screen.getByText('Preferred')).toBeVisible();
  expect(
    screen.getAllByRole('region').map((section) => section.getAttribute('aria-label'))
  ).toEqual(['Contact methods', 'Addresses', 'Notes']);
  expect(screen.getByRole('textbox', { name: 'City' })).toHaveValue('');
  expect(screen.getByRole('textbox', { name: 'Address' })).toHaveValue(
    '18 Fictional Street\nOlinda'
  );
  expect(screen.getByRole('button', { name: 'Remove contact method 1' })).toBeVisible();
});

it('shares draft undo across name, direct method edits, address removal and notes before committing once', async () => {
  const user = userEvent.setup();
  const gateway = personTestGateway();
  const save = vi.fn(gateway.save);
  mount({ ...gateway, save });
  await screen.findByDisplayValue('Marina Duarte');
  const method = within(screen.getByRole('listitem', { name: 'Contact method 1' }));
  await user.clear(method.getByRole('textbox', { name: 'Contact value' }));
  await user.type(method.getByRole('textbox', { name: 'Contact value' }), 'raw custom text');
  await user.click(screen.getByRole('button', { name: 'Remove address 1' }));
  expect(screen.queryByRole('listitem', { name: 'Address 1' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByRole('listitem', { name: 'Address 1' })).toBeVisible();
  await user.type(screen.getByRole('textbox', { name: 'City' }), 'Unlisted city');
  await user.click(screen.getByRole('button', { name: 'Save details' }));
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0]?.[1]).toMatchObject({
    points: [expect.objectContaining({ value: 'raw custom text' }), expect.anything()],
    addresses: [expect.objectContaining({ city: 'Unlisted city' })],
  });
  expect(await screen.findByText('Saved to Contacts.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByDisplayValue('Marina@Example.test')).toBeVisible();
});

it('preserves failed drafts and their original version across reload rather than removing new provider facts implicitly', async () => {
  const user = userEvent.setup();
  const original = personSnapshot();
  const refreshed = { ...original, version: 2 };
  const gateway = personTestGateway(original);
  const save = vi
    .fn(gateway.save)
    .mockRejectedValue(new ContactError('stale', 'contacts.http.409'));
  const load = vi.fn(gateway.load).mockResolvedValueOnce(original).mockResolvedValue(refreshed);
  mount({ ...gateway, save, load });
  await screen.findByDisplayValue('Marina Duarte');
  await user.type(screen.getByRole('textbox', { name: 'Person name' }), ' Jr');
  await user.click(screen.getByRole('button', { name: 'Save details' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('contacts.http.409');
  await user.click(screen.getByRole('button', { name: 'Reload person' }));
  expect(screen.getByRole('textbox', { name: 'Person name' })).toHaveValue('Marina Duarte Jr');
  expect(screen.getByRole('button', { name: 'Save details' })).toBeDisabled();
  expect(save.mock.calls[0]?.[2].version).toBe(1);
  await user.click(screen.getByRole('button', { name: 'Discard draft and review latest' }));
  expect(screen.getByRole('textbox', { name: 'Person name' })).toHaveValue('Marina Duarte');
});

it('treats Other as raw text with copy only and keeps URL distinct', async () => {
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  const data = personSnapshot();
  const point = data.points[0];
  if (!point) throw new Error('Missing point fixture');
  data.points = [{ ...point, kind: 'other', value: 'opaque @raw\n:value' }];
  mount(personTestGateway(data));
  expect(await screen.findByRole('textbox', { name: 'Contact value' })).toHaveValue(
    'opaque @raw\n:value'
  );
  const row = within(screen.getByRole('listitem', { name: 'Contact method 1' }));
  expect(row.queryByRole('link')).not.toBeInTheDocument();
  await user.click(row.getByRole('button', { name: 'Copy value' }));
  expect(copy).toHaveBeenCalledExactlyOnceWith('opaque @raw\n:value');
  await user.selectOptions(row.getByRole('combobox'), 'url');
  expect(row.getByRole('combobox')).toHaveValue('url');
});

it('keeps uncertain writes blocked with entered data available and recovers a failed initial load', async () => {
  const user = userEvent.setup();
  const gateway = personTestGateway();
  const load = vi
    .fn(gateway.load)
    .mockRejectedValueOnce(new ContactError('service', 'contacts.http.500'))
    .mockResolvedValue(personSnapshot());
  mount({
    ...gateway,
    load,
    save: vi.fn().mockRejectedValue(new ContactError('network', 'contacts.network')),
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('contacts.http.500');
  await user.click(screen.getByRole('button', { name: 'Reload person' }));
  await screen.findByDisplayValue('Marina Duarte');
  await user.type(screen.getByRole('textbox', { name: 'Notes' }), ' saved draft');
  await user.click(screen.getByRole('button', { name: 'Save details' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('contacts.network');
  expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('Existing notes saved draft');
  expect(screen.getByRole('button', { name: 'Save details' })).toBeDisabled();
});
