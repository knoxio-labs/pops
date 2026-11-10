import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';

import { EntityPanel } from './EntityPanel';

import type { Entity } from '../contacts-api/types.gen';
import type { ContactGateway, ContactSnapshot } from './api';

const entity: Entity = {
  id: 'company-1',
  name: 'Harbour Books',
  type: 'company',
  aliases: [],
  defaultTags: [],
  lastEditedTime: '2026-11-10T00:00:00Z',
};
const snapshot: ContactSnapshot = { entity, points: [], addresses: [] };

function mount(gateway: ContactGateway) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <EntityPanel id={entity.id} gateway={gateway} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

it('shows contact methods and addresses before editable details for a business', async () => {
  const user = userEvent.setup();
  const gateway: ContactGateway = {
    search: vi.fn(),
    resolve: vi.fn(),
    create: vi.fn(),
    load: vi.fn().mockResolvedValue(snapshot),
    update: vi.fn().mockResolvedValue({ ...entity, name: 'Harbour Books Pty Ltd', notes: null }),
    addPoint: vi.fn(),
    addAddress: vi.fn(),
  };
  mount(gateway);
  await screen.findByDisplayValue('Harbour Books');
  expect(
    screen.getAllByRole('region').map((section) => section.getAttribute('aria-label'))
  ).toEqual(['Contact methods', 'Addresses']);
  expect(screen.getByRole('heading', { name: 'Details' })).toBeVisible();
  await user.type(screen.getByRole('textbox', { name: 'Contact name' }), ' Pty Ltd');
  await user.clear(screen.getByRole('textbox', { name: 'Notes' }));
  await user.click(screen.getByRole('button', { name: 'Save details' }));
  expect(gateway.update).toHaveBeenCalledExactlyOnceWith(entity.id, 'Harbour Books Pty Ltd', '');
  expect(await screen.findByDisplayValue('Harbour Books Pty Ltd')).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Contact methods' })).getByText(
      'No contact methods yet.'
    )
  ).toBeVisible();
});
