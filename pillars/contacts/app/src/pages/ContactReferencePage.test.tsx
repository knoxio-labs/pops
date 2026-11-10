import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { expect, it, vi } from 'vitest';

import { ContactReferencePage } from './ContactReferencePage';

import type { Entity } from '../contacts-api/types.gen';

vi.mock('../entity/EntityPanel', () => ({
  EntityPanel: ({ id }: { id: string }) => <p>Business editor {id}</p>,
}));
vi.mock('../person/PersonPanel', () => ({
  PersonPanel: ({ id }: { id: string }) => <p>Person editor {id}</p>,
}));

function renderReference(entity: Entity) {
  const load = vi.fn().mockResolvedValue(entity);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[`/contacts/${entity.id}`]}>
        <Routes>
          <Route path="/contacts/:entityId" element={<ContactReferencePage load={load} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return load;
}

const entity = (type: string): Entity => ({
  id: `entity-${type}`,
  name: `Name ${type}`,
  type,
  aliases: [],
  defaultTags: [],
  lastEditedTime: '2026-11-10T00:00:00Z',
});

it('dispatches a canonical person reference to the existing person detail surface', async () => {
  const load = renderReference(entity('person'));
  expect(await screen.findByText('Person editor entity-person')).toBeVisible();
  expect(load).toHaveBeenCalledExactlyOnceWith('entity-person');
});

it.each(['company', 'organisation'])(
  'dispatches a canonical %s reference to the contact-method editor',
  async (type) => {
    renderReference(entity(type));
    expect(await screen.findByText(`Business editor entity-${type}`)).toBeVisible();
  }
);

it('shows only contract-backed name and type for other registered entity types', async () => {
  renderReference(entity('bank'));
  expect(await screen.findByRole('heading', { name: 'Name bank' })).toBeVisible();
  expect(screen.getByText('bank')).toBeVisible();
});
