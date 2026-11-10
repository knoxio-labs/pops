import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { DuplicateMergePanel } from './DuplicateMergePanel';

import type { Entity, SourceAccount, SourceRecord } from '../contacts-api/types.gen';
import type { ContactGateway } from '../entity/api';
import type { DuplicateMergeGateway } from './api';

const sourcePerson: Entity = {
  id: 'source-person',
  name: 'Alex Smith',
  type: 'person',
  aliases: [],
  defaultTags: [],
  lastEditedTime: '2026-11-10T00:00:00Z',
};
const keepPerson: Entity = { ...sourcePerson, id: 'keep-person', name: 'Alex Smith (work)' };
const sourceRecord: SourceRecord = {
  id: 'source-record',
  entityId: sourcePerson.id,
  accountId: 'account-1',
  collectionKey: 'contacts',
  recordKey: 'record-1',
  displayName: 'Alex Smith',
  givenName: 'Alex',
  familyName: 'Smith',
  additionalNames: null,
  namePrefix: null,
  nameSuffix: null,
  nameCompleteness: 'complete',
  active: true,
  lastSeenAt: '2026-11-10T00:00:00Z',
  revision: 1,
};
const account: SourceAccount = {
  id: 'account-1',
  provider: 'carddav',
  accountKey: 'address-book-1',
  label: 'Personal address book',
  createdAt: '2026-11-10T00:00:00Z',
};

function mount(gateway: DuplicateMergeGateway, searchGateway: ContactGateway) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DuplicateMergePanel gateway={gateway} searchGateway={searchGateway} />
    </QueryClientProvider>
  );
}

it('shows source evidence before preview and applies only after explicit confirmation', async () => {
  const user = userEvent.setup();
  const gateway: DuplicateMergeGateway = {
    load: vi.fn(async (id) => ({
      entity: id === sourcePerson.id ? sourcePerson : keepPerson,
      points: [],
      sources: id === sourcePerson.id ? [sourceRecord] : [],
      accounts: [account],
    })),
    merge: vi.fn().mockResolvedValue({
      canonicalId: keepPerson.id,
      memberIds: [keepPerson.id, sourcePerson.id],
      operationId: 'operation-1',
      revision: 5,
    }),
  };
  const searchGateway: ContactGateway = {
    search: vi.fn().mockResolvedValue([sourcePerson, keepPerson]),
    resolve: vi.fn(async (id: string) => ({
      entity: id === sourcePerson.id ? sourcePerson : keepPerson,
      reference: { canonicalId: id, uri: `pops:contacts/contact/${id}` },
    })),
    create: vi.fn(),
    load: vi.fn(),
    update: vi.fn(),
    addPoint: vi.fn(),
    addAddress: vi.fn(),
  };
  mount(gateway, searchGateway);
  await user.click(screen.getByRole('button', { name: 'Choose contact to merge' }));
  await user.type(screen.getByRole('textbox', { name: 'Search contacts' }), 'Alex');
  await user.click(await screen.findByText('Alex Smith'));
  expect(await screen.findByText('Personal address book')).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Choose contact to keep' }));
  await user.type(screen.getByRole('textbox', { name: 'Search contacts' }), 'Alex');
  await user.click(await screen.findByText('Alex Smith (work)'));
  await user.type(
    screen.getByRole('textbox', { name: 'Why do these records belong to the same contact?' }),
    'I verified both source records.'
  );
  await user.click(screen.getByRole('button', { name: 'Preview merge' }));
  const confirmation = screen.getByRole('group', { name: 'Merge confirmation' });
  expect(within(confirmation).getByText(/Merge Alex Smith into Alex Smith \(work\)/)).toBeVisible();
  expect(gateway.merge).not.toHaveBeenCalled();

  await user.click(within(confirmation).getByRole('button', { name: 'Merge contacts' }));
  await waitFor(() =>
    expect(gateway.merge).toHaveBeenCalledExactlyOnceWith(
      keepPerson.id,
      sourcePerson.id,
      'I verified both source records.',
      expect.any(String)
    )
  );
  expect(await screen.findByRole('status')).toHaveTextContent('The merge is applied.');
});
