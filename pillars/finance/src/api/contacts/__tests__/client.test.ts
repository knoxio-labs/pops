import { describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for {@link createContactsClient} driven against a hand-built stub
 * of the contacts pillar handle. These exercise the paths the in-memory fake
 * cannot model faithfully:
 *
 *  - The no-silent-cap paging sweep: it pages until `hasMore` is false, and
 *    when the safety cap is hit with rows still available it WARNS and returns
 *    a (visibly) truncated set rather than dropping the tail silently.
 *  - create-or-fetch-by-name against contacts' ACTUAL enforcement: name
 *    uniqueness is only case-SENSITIVE there (no UNIQUE constraint), so a
 *    case-variant must be deduped client-side by the fetch-FIRST step, and a
 *    genuine 409 race must re-fetch the existing id.
 */
import { type CallResult } from '@pops/pillar-sdk/server';

import {
  ContactsPermanentError,
  ContactsUnavailableError,
  createContactsClient,
  type ContactEntity,
  type ListResponse,
} from '../client.js';
import { conflict, entity, ok, page, stubHandle, unexpected } from './stub-handle.js';

describe('createContactsClient.fetchAllEntities — no-silent-cap paging', () => {
  it('pages until hasMore is false and concatenates every page', async () => {
    const pageA = [entity({ id: '1', name: 'Alpha' }), entity({ id: '2', name: 'Bravo' })];
    const pageB = [entity({ id: '3', name: 'Charlie' })];
    const list = vi.fn(async (input: { offset?: number }) =>
      (input.offset ?? 0) === 0 ? page(pageA, true) : page(pageB, false, 200)
    );
    const client = createContactsClient(() => stubHandle({ list }));

    const all = await client.fetchAllEntities();

    expect(all.map((e) => e.id)).toEqual(['1', '2', '3']);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('WARNS and returns a truncated set when the safety cap is hit with rows remaining', async () => {
    const list = vi.fn(async (input: { offset?: number }) =>
      page([entity({ id: String(input.offset ?? 0), name: 'Endless' })], true, input.offset ?? 0)
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = createContactsClient(() => stubHandle({ list }), { maxPages: 3 });

    const all = await client.fetchAllEntities();

    expect(all).toHaveLength(3);
    expect(list).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('safety cap'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('TRUNCATED'));
    warn.mockRestore();
  });

  it('degrades to an empty set (no throw) when a list page is not ok', async () => {
    const list = vi.fn(async (): Promise<CallResult<ListResponse>> => conflict('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = createContactsClient(() => stubHandle({ list }));

    expect(await client.fetchAllEntities()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('degraded'));
    warn.mockRestore();
  });
});

describe('createContactsClient.createOrFetchByName — robust against case-sensitive contacts', () => {
  it('creates a new contact when no name matches (created=true)', async () => {
    const fresh = entity({ id: 'new-1', name: 'Acme' });
    const create = vi.fn(async () => ok({ data: fresh, message: 'Created' }));
    const list = vi.fn(async () => page([], false));
    const client = createContactsClient(() => stubHandle({ list, create }));

    const result = await client.createOrFetchByName('Acme', 'company');

    expect(result).toEqual({ id: 'new-1', name: 'Acme', created: true });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('reuses a CASE-VARIANT existing contact via fetch-first, never calling create', async () => {
    const existing = entity({ id: 'acme-id', name: 'ACME' });
    const create = vi.fn(() => unexpected('entities.create'));
    const list = vi.fn(async () => page([existing], false));
    const client = createContactsClient(() => stubHandle({ list, create }));

    const result = await client.createOrFetchByName('acme', 'company');

    expect(result).toEqual({ id: 'acme-id', name: 'ACME', created: false });
    expect(create).not.toHaveBeenCalled();
  });

  it('tolerates a 409 race: fetch-first misses, create 409s, re-fetch resolves (created=false)', async () => {
    const existing = entity({ id: 'raced-id', name: 'Globex' });
    let listCalls = 0;
    const list = vi.fn(async () => {
      listCalls += 1;
      return listCalls === 1 ? page([], false) : page([existing], false);
    });
    const create = vi.fn(async (): Promise<CallResult<{ data: ContactEntity; message: string }>> =>
      conflict("Entity with name 'Globex' already exists")
    );
    const client = createContactsClient(() => stubHandle({ list, create }));

    const result = await client.createOrFetchByName('Globex', 'company');

    expect(result).toEqual({ id: 'raced-id', name: 'Globex', created: false });
    expect(create).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('throws when a 409 is reported but no existing contact can be re-fetched', async () => {
    const list = vi.fn(async () => page([], false));
    const create = vi.fn(async (): Promise<CallResult<{ data: ContactEntity; message: string }>> =>
      conflict('phantom')
    );
    const client = createContactsClient(() => stubHandle({ list, create }));

    await expect(client.createOrFetchByName('Ghost', 'company')).rejects.toThrow(
      'but no existing contact found'
    );
  });
});

describe('createContactsClient.createOrFetchByName — TRANSIENT vs PERMANENT create failures', () => {
  function createFailing(
    result: CallResult<{ data: ContactEntity; message: string }>
  ): ReturnType<typeof createContactsClient> {
    const list = vi.fn(async () => page([], false));
    const create = vi.fn(async () => result);
    return createContactsClient(() => stubHandle({ list, create }));
  }

  it.each([
    ['unavailable', { kind: 'unavailable', pillar: 'contacts' }],
    ['degraded', { kind: 'degraded', pillar: 'contacts', reason: 'reconciling' }],
    ['rate-limited', { kind: 'rate-limited', pillar: 'contacts', retryAfterSeconds: 30 }],
  ] satisfies [string, CallResult<{ data: ContactEntity; message: string }>][])(
    'throws ContactsUnavailableError (TRANSIENT) for a %s create result',
    async (_label, result) => {
      const client = createFailing(result);

      await expect(client.createOrFetchByName('Anything', 'company')).rejects.toThrow(
        'contacts pillar unavailable'
      );
    }
  );

  it.each([
    ['bad-request', { kind: 'bad-request', pillar: 'contacts', message: 'invalid name' }],
    ['unauthorized', { kind: 'unauthorized', pillar: 'contacts' }],
    [
      'contract-mismatch',
      { kind: 'contract-mismatch', pillar: 'contacts', expected: 'Entity', actual: 'unknown' },
    ],
    ['refused', { kind: 'refused', pillar: 'contacts', status: 413, message: 'payload too large' }],
  ] satisfies [string, CallResult<{ data: ContactEntity; message: string }>][])(
    'throws ContactsPermanentError for a %s create result',
    async (_label, result) => {
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const client = createFailing(result);

      await expect(client.createOrFetchByName('Anything', 'company')).rejects.toThrow(
        ContactsPermanentError
      );
      errorLog.mockRestore();
    }
  );

  it('logs a credential-refusal line, not a generic one, for an unauthorized create', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = createFailing({ kind: 'unauthorized', pillar: 'contacts' });

    await expect(client.createOrFetchByName('Anything', 'company')).rejects.toThrow(
      ContactsPermanentError
    );

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("rejected this pillar's service-account credential")
    );
    errorLog.mockRestore();
  });
});

describe('createContactsClient — no service-account key (POPS-2021)', () => {
  it('fetchAllEntities degrades to empty without calling the handle', async () => {
    const client = createContactsClient(() => null);

    await expect(client.fetchAllEntities()).resolves.toEqual([]);
  });

  it('fetchEntityDefaultTags degrades to empty without calling the handle', async () => {
    const client = createContactsClient(() => null);

    await expect(client.fetchEntityDefaultTags('entity-1')).resolves.toEqual([]);
  });

  it('createOrFetchByName throws the TRANSIENT error, not a silent success', async () => {
    const client = createContactsClient(() => null);

    await expect(client.createOrFetchByName('Anything', 'company')).rejects.toThrow(
      ContactsUnavailableError
    );
  });
});

describe('createContactsClient — a callee that refuses the credential on a read (POPS-2021)', () => {
  it('logs a credential-refusal line, not the generic "degraded" warning, on entities.list', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const list = vi.fn(async (): Promise<CallResult<ListResponse>> => ({
      kind: 'unauthorized',
      pillar: 'contacts',
    }));
    const client = createContactsClient(() => stubHandle({ list }));

    await expect(client.fetchAllEntities()).resolves.toEqual([]);

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("rejected this pillar's service-account credential")
    );
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('degraded'));
    errorLog.mockRestore();
    warn.mockRestore();
  });
});
