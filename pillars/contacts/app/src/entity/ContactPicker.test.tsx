import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { ContactPicker } from './ContactPicker';

import type { ReactNode } from 'react';

import type { Entity } from '../contacts-api/types.gen';
import type { ContactGateway } from './api';

const company: Entity = {
  id: 'company-1',
  name: 'Harbour Books',
  type: 'company',
  aliases: [],
  defaultTags: [],
  lastEditedTime: '2026-11-10T00:00:00Z',
};

function gateway(): ContactGateway {
  return {
    search: vi.fn().mockResolvedValue([company]),
    resolve: vi.fn().mockResolvedValue({
      entity: company,
      reference: { canonicalId: company.id, uri: 'pops:contacts/contact/company-1' },
    }),
    create: vi.fn(),
    load: vi.fn(),
    update: vi.fn(),
    addPoint: vi.fn(),
    addAddress: vi.fn(),
  };
}

function mount(children: ReactNode) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

it('reports an explicit existing selection to its controlled host', async () => {
  const user = userEvent.setup();
  const api = gateway();
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  mount(
    <ContactPicker
      open
      onOpenChange={onOpenChange}
      onSelect={onSelect}
      onCreate={vi.fn()}
      gateway={api}
    />
  );
  await user.type(screen.getByPlaceholderText('Search contacts'), 'Harbour');
  const result = await screen.findByText('Harbour Books');
  const resultButton = result.closest('button');
  if (!resultButton) throw new Error('Contact result is not selectable');
  expect(resultButton).toHaveClass('min-h-11', 'min-w-11');
  await user.click(resultButton);
  expect(api.search).toHaveBeenLastCalledWith('Harbour', undefined);
  await waitFor(() => expect(api.resolve).toHaveBeenCalledExactlyOnceWith(company.id));
  await waitFor(() =>
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(company, {
      canonicalId: 'company-1',
      uri: 'pops:contacts/contact/company-1',
    })
  );
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('reports create intent only for the entered name without creating or linking implicitly', async () => {
  const user = userEvent.setup();
  const api = gateway();
  const onCreate = vi.fn();
  mount(
    <ContactPicker
      open
      onOpenChange={vi.fn()}
      onSelect={vi.fn()}
      onCreate={onCreate}
      gateway={api}
    />
  );
  const create = screen.getByRole('button', { name: 'Create new' });
  expect(create).toBeDisabled();
  await user.type(screen.getByPlaceholderText('Search contacts'), 'New');
  await waitFor(() => expect(create).toBeEnabled());
  await user.click(create);
  expect(onCreate).toHaveBeenCalledExactlyOnceWith('New');
  expect(api.create).not.toHaveBeenCalled();
});

it('retries canonical resolution after a selected result cannot be resolved', async () => {
  const user = userEvent.setup();
  const api = gateway();
  api.resolve = vi
    .fn()
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValue({
      entity: company,
      reference: { canonicalId: company.id, uri: 'pops:contacts/contact/company-1' },
    });
  const onSelect = vi.fn();
  mount(<ContactPicker open onOpenChange={vi.fn()} onSelect={onSelect} gateway={api} />);
  await user.type(screen.getByPlaceholderText('Search contacts'), 'Harbour');
  const result = await screen.findByText('Harbour Books');
  const resultButton = result.closest('button');
  if (!resultButton) throw new Error('Contact result is not selectable');
  await user.click(resultButton);
  await screen.findByRole('alert');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() =>
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(company, {
      canonicalId: company.id,
      uri: 'pops:contacts/contact/company-1',
    })
  );
  expect(api.resolve).toHaveBeenCalledTimes(2);
});
