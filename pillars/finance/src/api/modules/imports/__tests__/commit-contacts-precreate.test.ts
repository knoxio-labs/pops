import { describe, expect, it, vi } from 'vitest';

import { page, stubHandle } from '../../../contacts/__tests__/stub-handle.js';
import { createContactsClient, type ContactEntity } from '../../../contacts/client.js';
import { preCreatePendingContacts } from '../commit-contacts-precreate.js';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { CommitPayload } from '../types.js';

function payloadFor(name: string): CommitPayload {
  return {
    entities: [
      { tempId: 'temp:entity:00000000-0000-0000-0000-000000000000', name, type: 'company' },
    ],
    changeSets: [],
    tagRuleChangeSets: [],
    transactions: [],
  };
}

describe('preCreatePendingContacts — a rate-limited (429) create degrades like unavailable', () => {
  it('queues an outbox candidate and a pending placeholder instead of aborting the commit', async () => {
    const list = vi.fn(async () => page([], false));
    const create = vi.fn(
      async (): Promise<CallResult<{ data: ContactEntity; message: string }>> => ({
        kind: 'rate-limited',
        pillar: 'contacts',
        retryAfterSeconds: 30,
      })
    );
    const client = createContactsClient(() => stubHandle({ list, create }));

    const result = await preCreatePendingContacts(client, payloadFor('Acme'));

    expect(result.outboxCandidates).toEqual([
      { placeholderId: expect.stringMatching(/^pending:contact:/), name: 'Acme', type: 'company' },
    ]);
    expect(result.tempIdMap.get('temp:entity:00000000-0000-0000-0000-000000000000')).toMatch(
      /^pending:contact:/
    );
    expect(result.entitiesCreated).toBe(0);
  });

  it('queues an outbox candidate for a 408 (unavailable) create, same as 429, instead of aborting', async () => {
    const list = vi.fn(async () => page([], false));
    const create = vi.fn(
      async (): Promise<CallResult<{ data: ContactEntity; message: string }>> => ({
        kind: 'unavailable',
        pillar: 'contacts',
      })
    );
    const client = createContactsClient(() => stubHandle({ list, create }));

    const result = await preCreatePendingContacts(client, payloadFor('Acme'));

    expect(result.outboxCandidates).toEqual([
      { placeholderId: expect.stringMatching(/^pending:contact:/), name: 'Acme', type: 'company' },
    ]);
    expect(result.entitiesCreated).toBe(0);
  });

  it('still aborts (propagates) for a PERMANENT failure like refused (413), unlike rate-limited', async () => {
    const list = vi.fn(async () => page([], false));
    const create = vi.fn(
      async (): Promise<CallResult<{ data: ContactEntity; message: string }>> => ({
        kind: 'refused',
        pillar: 'contacts',
        status: 413,
        message: 'payload too large',
      })
    );
    const client = createContactsClient(() => stubHandle({ list, create }));

    await expect(preCreatePendingContacts(client, payloadFor('Acme'))).rejects.toThrow(
      'contacts pillar rejected entity pre-create'
    );
  });
});
