import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { expect, it, vi } from 'vitest';

import { CreateContactPanel } from './CreateContactPanel';

import type { Entity } from '../contacts-api/types.gen';
import type { ContactCreationGateway } from './api';

const company: Entity = {
  id: 'company-1',
  name: 'Harbour Books',
  type: 'company',
  aliases: [],
  defaultTags: [],
  lastEditedTime: '2026-11-10T00:00:00Z',
};

function mount(gateway: ContactCreationGateway) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/contacts/new']}>
        <Routes>
          <Route path="/contacts/new" element={<CreateContactPanel gateway={gateway} />} />
          <Route path="/contacts/entities/:entityId" element={<p>Contact detail route</p>} />
          <Route path="/contacts/people/:personId" element={<p>Person detail route</p>} />
          <Route path="/contacts/bank-1" element={<p>Bank route</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

it('creates only the explicitly typed entity before opening its progressive editor', async () => {
  const user = userEvent.setup();
  const gateway: ContactCreationGateway = {
    catalogue: vi
      .fn()
      .mockResolvedValue({ types: ['person', 'company', 'organisation'], defaultType: 'company' }),
    search: vi.fn(),
    resolve: vi.fn(),
    create: vi.fn().mockResolvedValue(company),
    load: vi.fn(),
    update: vi.fn(),
    addPoint: vi.fn(),
    addAddress: vi.fn(),
  };
  mount(gateway);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Contact name' })).toBeEnabled());
  await user.type(screen.getByRole('textbox', { name: 'Contact name' }), 'Harbour Books');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Contact type' }), 'company');
  await user.click(screen.getByRole('button', { name: 'Create contact' }));
  expect(gateway.create).toHaveBeenCalledExactlyOnceWith('Harbour Books', 'company');
  expect(await screen.findByText('Contact detail route')).toBeVisible();
  expect(gateway.addPoint).not.toHaveBeenCalled();
  expect(gateway.addAddress).not.toHaveBeenCalled();
});

it('keeps the draft and does not navigate when create fails', async () => {
  const user = userEvent.setup();
  const gateway: ContactCreationGateway = {
    catalogue: vi
      .fn()
      .mockResolvedValue({ types: ['person', 'company', 'organisation'], defaultType: 'company' }),
    search: vi.fn(),
    resolve: vi.fn(),
    create: vi.fn().mockRejectedValue(new Error('Create failed')),
    load: vi.fn(),
    update: vi.fn(),
    addPoint: vi.fn(),
    addAddress: vi.fn(),
  };
  mount(gateway);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Contact name' })).toBeEnabled());
  await user.type(screen.getByRole('textbox', { name: 'Contact name' }), 'New person');
  await user.click(screen.getByRole('button', { name: 'Create contact' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Create failed');
  expect(screen.getByRole('textbox', { name: 'Contact name' })).toHaveValue('New person');
  expect(screen.queryByText('Person detail route')).not.toBeInTheDocument();
});

it('opens the Bank route for an explicitly selected source-catalogue type', async () => {
  const user = userEvent.setup();
  const bank = { ...company, id: 'bank-1', name: '界', type: 'bank' };
  const gateway: ContactCreationGateway = {
    catalogue: vi.fn().mockResolvedValue({
      types: ['company', 'person', 'government', 'bank', 'place', 'brand', 'organisation'],
      defaultType: 'company',
    }),
    search: vi.fn(),
    resolve: vi.fn(),
    create: vi.fn().mockResolvedValue(bank),
    load: vi.fn(),
    update: vi.fn(),
    addPoint: vi.fn(),
    addAddress: vi.fn(),
  };
  mount(gateway);
  const name = screen.getByRole('textbox', { name: 'Contact name' });
  await waitFor(() => expect(name).toBeEnabled());
  expect(screen.getByRole('combobox', { name: 'Contact type' })).toHaveValue('company');
  await user.type(name, '界');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Contact type' }), 'bank');
  await user.click(screen.getByRole('button', { name: 'Create contact' }));
  expect(gateway.create).toHaveBeenCalledExactlyOnceWith('界', 'bank');
  expect(await screen.findByText('Bank route')).toBeVisible();
  expect(screen.queryByText('Contact detail route')).not.toBeInTheDocument();
  expect(gateway.addPoint).not.toHaveBeenCalled();
  expect(gateway.addAddress).not.toHaveBeenCalled();
});
