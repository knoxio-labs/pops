import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { ContactError } from '../errors';
import { ContactChooser } from './ContactChooser';
import { ContactChooserSession } from './ContactChooserSession';

import type { Entity } from '../contacts-api/types.gen';
import type { ContactCreationGateway } from './api';

const entity: Entity = {
  id: 'created',
  name: '界',
  type: 'bank',
  aliases: [],
  defaultTags: [],
  lastEditedTime: '2026-11-10T00:00:00Z',
};
const canonical = { ...entity, id: 'canonical' };
const reference = { canonicalId: canonical.id, uri: 'pops:contacts/contact/canonical' };
function gateway(): ContactCreationGateway {
  return {
    catalogue: vi.fn().mockResolvedValue({
      types: ['person', 'company', 'government', 'bank', 'place', 'brand', 'organisation'],
      defaultType: 'bank',
    }),
    search: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(entity),
    resolve: vi.fn().mockResolvedValue({ entity: canonical, reference }),
    load: vi.fn(),
    update: vi.fn(),
    addPoint: vi.fn(),
    addAddress: vi.fn(),
  };
}
function mount(api: ContactCreationGateway, onSelect = vi.fn()) {
  function Host() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open chooser
        </button>
        <ContactChooser open={open} onOpenChange={setOpen} onSelect={onSelect} gateway={api} />
      </>
    );
  }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: 3 } } })}>
      <Host />
    </QueryClientProvider>
  );
  return onSelect;
}
async function openCreate() {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Search contacts' }), '界');
  await user.click(screen.getByRole('button', { name: 'Create new' }));
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Contact type' })).toHaveValue('bank')
  );
  return user;
}

it('searches and creates a single Unicode character with the source default and returns actual canonical data in place', async () => {
  const api = gateway();
  const onSelect = mount(api);
  const user = await openCreate();
  expect(api.search).toHaveBeenLastCalledWith('界', undefined);
  expect(screen.getByRole('option', { name: 'Government' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Create contact' }));
  await waitFor(() => expect(onSelect).toHaveBeenCalledExactlyOnceWith(canonical, reference));
  expect(api.create).toHaveBeenCalledExactlyOnceWith('界', 'bank');
  expect(api.resolve).toHaveBeenCalledExactlyOnceWith('created');
});

it('retains the name and explicitly selected type across dismissal and reopening', async () => {
  const api = gateway();
  mount(api);
  const user = await openCreate();
  await user.type(screen.getByRole('textbox', { name: 'Contact name' }), ' retained');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Contact type' }), 'government');
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await user.click(screen.getByRole('button', { name: 'Open chooser' }));
  expect(screen.getByRole('textbox', { name: 'Contact name' })).toHaveValue('界 retained');
  expect(screen.getByRole('combobox', { name: 'Contact type' })).toHaveValue('government');
  expect(api.create).not.toHaveBeenCalled();
});

it('retries only canonical resolution after the entity has definitely been created', async () => {
  const api = gateway();
  api.resolve = vi
    .fn()
    .mockRejectedValueOnce(new ContactError('network', 'contacts.network'))
    .mockResolvedValue({ entity: canonical, reference });
  const onSelect = mount(api);
  const user = await openCreate();
  await user.click(screen.getByRole('button', { name: 'Create contact' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('contacts.network');
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await user.click(screen.getByRole('button', { name: 'Open chooser' }));
  expect(screen.getByRole('textbox', { name: 'Contact name' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Use created contact' }));
  await waitFor(() => expect(onSelect).toHaveBeenCalledExactlyOnceWith(canonical, reference));
  expect(api.create).toHaveBeenCalledOnce();
  expect(api.resolve).toHaveBeenCalledTimes(2);
});

it('locks an unknown creation outcome and retains the attempted draft across reopen', async () => {
  const api = gateway();
  api.create = vi.fn().mockRejectedValue(new ContactError('network', 'contacts.network'));
  const onSelect = mount(api);
  const user = await openCreate();
  await user.click(screen.getByRole('button', { name: 'Create contact' }));
  expect(await screen.findByText(/The create outcome is unknown/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await user.click(screen.getByRole('button', { name: 'Open chooser' }));
  expect(screen.getByRole('textbox', { name: 'Contact name' })).toHaveValue('界');
  expect(screen.getByRole('button', { name: 'Create contact' })).toBeDisabled();
  expect(api.create).toHaveBeenCalledOnce();
  expect(onSelect).not.toHaveBeenCalled();
});

it('requires explicit existing selection after a duplicate conflict', async () => {
  const api = gateway();
  api.create = vi.fn().mockRejectedValue(new ContactError('stale', 'contacts.http.409'));
  api.search = vi.fn().mockResolvedValue([entity]);
  const onSelect = mount(api);
  const user = await openCreate();
  await user.click(screen.getByRole('button', { name: 'Create contact' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Choose the existing contact explicitly'
  );
  expect(onSelect).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Choose an existing contact' }));
  await user.click(await screen.findByRole('button', { name: /界.*bank/ }));
  await waitFor(() => expect(onSelect).toHaveBeenCalledExactlyOnceWith(canonical, reference));
  expect(api.create).toHaveBeenCalledOnce();
});

it('does not deliver an asynchronous selection after dismissal and never repeats a known create', async () => {
  const api = gateway();
  let finish: (entity: Entity) => void = () => {
    throw new Error('Not started');
  };
  api.create = vi.fn(
    () =>
      new Promise<Entity>((resolve) => {
        finish = resolve;
      })
  );
  const onSelect = mount(api);
  const user = await openCreate();
  await user.click(screen.getByRole('button', { name: 'Create contact' }));
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await act(async () => finish(entity));
  expect(onSelect).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Open chooser' }));
  await user.click(screen.getByRole('button', { name: 'Use created contact' }));
  await waitFor(() => expect(onSelect).toHaveBeenCalledExactlyOnceWith(canonical, reference));
  expect(api.create).toHaveBeenCalledOnce();
});

it('keeps existing selection available when creation catalogue loading fails', async () => {
  const api = gateway();
  api.catalogue = vi.fn().mockRejectedValue(new ContactError('service', 'contacts.http.500'));
  api.search = vi.fn().mockResolvedValue([entity]);
  const onSelect = mount(api);
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Search contacts' }), '界');
  await user.click(await screen.findByRole('button', { name: /界.*bank/ }));
  await waitFor(() => expect(onSelect).toHaveBeenCalledExactlyOnceWith(canonical, reference));
  expect(api.create).not.toHaveBeenCalled();
});

it('locks an acknowledged create without a usable identity instead of repeating POST', async () => {
  const api = gateway();
  api.create = vi.fn().mockResolvedValue({ ...entity, id: '' });
  const onSelect = mount(api);
  const user = await openCreate();
  await user.click(screen.getByRole('button', { name: 'Create contact' }));
  expect(await screen.findByText(/The create outcome is unknown/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await user.click(screen.getByRole('button', { name: 'Open chooser' }));
  expect(screen.getByRole('button', { name: 'Create contact' })).toBeDisabled();
  expect(api.create).toHaveBeenCalledOnce();
  expect(api.resolve).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
});

it('retains an in-flight intent across route unmount and resolves the known entity on remount', async () => {
  const api = gateway();
  const session = new ContactChooserSession();
  const onSelect = vi.fn();
  const client = new QueryClient();
  let finish: (value: Entity) => void = () => {
    throw new Error('Not started');
  };
  api.create = vi.fn(
    () =>
      new Promise<Entity>((resolve) => {
        finish = resolve;
      })
  );
  const view = () => (
    <QueryClientProvider client={client}>
      <ContactChooser
        open
        onOpenChange={vi.fn()}
        onSelect={onSelect}
        gateway={api}
        session={session}
      />
    </QueryClientProvider>
  );
  const mounted = render(view());
  const user = await openCreate();
  await user.click(screen.getByRole('button', { name: 'Create contact' }));
  mounted.unmount();
  await act(async () => finish(entity));
  expect(onSelect).not.toHaveBeenCalled();
  render(view());
  expect(screen.getByRole('textbox', { name: 'Contact name' })).toHaveValue('界');
  await user.click(screen.getByRole('button', { name: 'Use created contact' }));
  await waitFor(() => expect(onSelect).toHaveBeenCalledExactlyOnceWith(canonical, reference));
  expect(api.create).toHaveBeenCalledOnce();
});
