import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { expect, it, vi } from 'vitest';

import { ContactError } from '../errors';
import { ContactChooser } from './ContactChooser';
import { ContactChooserSession } from './ContactChooserSession';

import type { Entity } from '../contacts-api/types.gen';
import type { ContactCreationGateway, ContactSelection } from './api';

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

it.each([
  ['en-AU', 'Search contacts', 'Create new'],
  ['pt-BR', 'Pesquisar contatos', 'Criar novo'],
])(
  'localizes a fresh %s embed without a Contacts remote or preloaded namespace',
  async (locale, searchLabel, createLabel) => {
    const instance = createInstance();
    await instance.init({ lng: locale, resources: {}, interpolation: { escapeValue: false } });
    expect(instance.hasResourceBundle(locale, 'contacts')).toBe(false);
    render(
      <I18nextProvider i18n={instance}>
        <QueryClientProvider client={new QueryClient()}>
          <ContactChooser open onOpenChange={vi.fn()} onSelect={vi.fn()} gateway={gateway()} />
        </QueryClientProvider>
      </I18nextProvider>
    );
    expect(await screen.findByRole('textbox', { name: searchLabel })).toBeVisible();
    expect(screen.getByRole('button', { name: createLabel })).toBeVisible();
    expect(instance.hasResourceBundle('en-AU', 'contacts')).toBe(true);
    expect(instance.hasResourceBundle('pt-BR', 'contacts')).toBe(true);
    await act(async () => {
      await instance.changeLanguage(locale === 'pt-BR' ? 'en-AU' : 'pt-BR');
    });
    expect(
      screen.getByRole('textbox', {
        name: locale === 'pt-BR' ? 'Search contacts' : 'Pesquisar contatos',
      })
    ).toBeVisible();
  }
);

it.each([false, true])(
  'fences existing resolution after dismissal (reopen before completion: %s) and retries the selected ID explicitly',
  async (reopen) => {
    const api = gateway();
    api.search = vi.fn().mockResolvedValue([entity]);
    let finish: (value: ContactSelection) => void = () => {
      throw new Error('Not started');
    };
    api.resolve = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<ContactSelection>((resolve) => {
            finish = resolve;
          })
      )
      .mockResolvedValue({ entity: canonical, reference });
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    const client = new QueryClient();
    const view = (open: boolean) => (
      <QueryClientProvider client={client}>
        <ContactChooser open={open} onOpenChange={onOpenChange} onSelect={onSelect} gateway={api} />
      </QueryClientProvider>
    );
    const mounted = render(view(true));
    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox', { name: 'Search contacts' }), '界');
    await user.click(await screen.findByRole('button', { name: /界.*bank/ }));
    mounted.rerender(view(false));
    if (reopen) mounted.rerender(view(true));
    await act(async () => finish({ entity: canonical, reference }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    if (!reopen) mounted.rerender(view(true));
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledExactlyOnceWith(canonical, reference));
    expect(api.resolve).toHaveBeenNthCalledWith(2, entity.id);
  }
);

it('keeps an older resolution from replacing a newly explicit existing selection', async () => {
  const api = gateway();
  const other = { ...entity, id: 'other', name: 'B' };
  api.search = vi.fn(async (query) => (query === 'B' ? [other] : [entity]));
  let finish: (value: ContactSelection) => void = () => {
    throw new Error('Not started');
  };
  const otherReference = { canonicalId: other.id, uri: 'pops:contacts/contact/other' };
  api.resolve = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<ContactSelection>((resolve) => {
          finish = resolve;
        })
    )
    .mockResolvedValue({ entity: other, reference: otherReference });
  const onSelect = mount(api);
  const user = userEvent.setup();
  const search = await screen.findByRole('textbox', { name: 'Search contacts' });
  await user.type(search, '界');
  await user.click(await screen.findByRole('button', { name: /界.*bank/ }));
  await user.clear(search);
  await user.type(search, 'B');
  await user.click(await screen.findByRole('button', { name: /B.*bank/ }));
  await waitFor(() => expect(onSelect).toHaveBeenCalledExactlyOnceWith(other, otherReference));
  await act(async () => finish({ entity: canonical, reference }));
  expect(onSelect).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'fences a pending create across replaced intent including ABA return (%s)',
  async (returnToA) => {
    const api = gateway();
    const first = new ContactChooserSession();
    first.start('Alice');
    first.setType('person');
    const second = new ContactChooserSession();
    second.start('Bob');
    second.setType('person');
    let finish: (value: Entity) => void = () => {
      throw new Error('Not started');
    };
    api.create = vi.fn(
      () =>
        new Promise<Entity>((resolve) => {
          finish = resolve;
        })
    );
    const onSelect = vi.fn();
    const client = new QueryClient();
    const view = (session: ContactChooserSession) => (
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
    const mounted = render(view(first));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Create contact' }));
    mounted.rerender(view(second));
    if (returnToA) mounted.rerender(view(first));
    await act(async () => finish(entity));
    expect(onSelect).not.toHaveBeenCalled();
    expect(first.snapshot().created).toEqual(entity);
    expect(second.snapshot()).toMatchObject({ name: 'Bob', created: null });
    mounted.rerender(view(first));
    await user.click(await screen.findByRole('button', { name: 'Use created contact' }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledExactlyOnceWith(canonical, reference));
    expect(api.create).toHaveBeenCalledOnce();
  }
);

it('retains a known create but requires explicit resolution after gateway context replacement', async () => {
  const firstApi = gateway();
  const replacement = gateway();
  const session = new ContactChooserSession();
  session.start('Alice');
  session.setType('person');
  let finish: (value: Entity) => void = () => {
    throw new Error('Not started');
  };
  firstApi.create = vi.fn(
    () =>
      new Promise<Entity>((resolve) => {
        finish = resolve;
      })
  );
  const onSelect = vi.fn();
  const client = new QueryClient();
  const view = (api: ContactCreationGateway) => (
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
  const mounted = render(view(firstApi));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Create contact' }));
  mounted.rerender(view(replacement));
  await act(async () => finish(entity));
  expect(onSelect).not.toHaveBeenCalled();
  expect(session.snapshot().created).toEqual(entity);
  await user.click(await screen.findByRole('button', { name: 'Use created contact' }));
  await waitFor(() => expect(onSelect).toHaveBeenCalledExactlyOnceWith(canonical, reference));
  expect(firstApi.create).toHaveBeenCalledOnce();
  expect(replacement.create).not.toHaveBeenCalled();
  expect(replacement.resolve).toHaveBeenCalledExactlyOnceWith(entity.id);
});
