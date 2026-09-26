/**
 * Who a mutation is recorded against, and which grant reaches which sync
 * route. `Pops-Actor` is believed only from a caller whose service account
 * holds `inventory.sync` (bfm); anyone else is `web` or `service:<account>`.
 */
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { events } from '../../db/index.js';
import { inventoryScopeMap } from '../middleware/service-account-scope.js';
import { parseActorHeader, resolveActor } from '../sync/actor.js';
import {
  createItem,
  granting,
  openSyncHarness,
  PROTOCOL,
  SYNC_KEY,
  type SyncHarness,
} from './sync-harness.js';
import { createTestTransport } from './test-http.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const transport = createTestTransport();
let h: SyncHarness | undefined;

afterEach(() => {
  h?.close();
  h = undefined;
  vi.restoreAllMocks();
});

function harness(verify: ServiceAccountVerifier): SyncHarness {
  h = openSyncHarness(transport, { verify });
  return h;
}

const PHONE_ACTOR = 'device:dev_7f3a;label=Jo%C3%A3o%E2%80%99s%20iPhone';

async function createAs(
  target: SyncHarness,
  headers: Record<string, string>
): Promise<{ status: number; actor?: { kind: string; id: string | null; label: string | null } }> {
  const response = await target.api
    .post('/sync/mutations')
    .set({ ...PROTOCOL, ...headers })
    .send({ mutations: [createItem(randomUUID(), 'Kettle')] });
  const event = target.db.db.select().from(events).all().at(-1);
  return {
    status: response.status,
    actor: event && { kind: event.actorKind, id: event.actorId, label: event.actorLabel },
  };
}

describe('the recorded actor', () => {
  it('is the device in Pops-Actor when the caller holds inventory.sync', async () => {
    const result = await createAs(harness(granting(['inventory.sync', 'inventory.types'])), {
      'x-api-key': SYNC_KEY,
      'pops-actor': PHONE_ACTOR,
    });
    expect(result).toEqual({
      status: 200,
      actor: { kind: 'device', id: 'dev_7f3a', label: 'João’s iPhone' },
    });
  });

  it('believes a root inventory grant too, since it covers inventory.sync', async () => {
    const result = await createAs(harness(granting(['inventory'], 'pops_api_key')), {
      'x-api-key': SYNC_KEY,
      'pops-actor': PHONE_ACTOR,
    });
    expect(result.actor?.kind).toBe('device');
  });

  it('ignores Pops-Actor from a caller with no key and records web', async () => {
    const verify = vi.fn(granting(['inventory.sync']));
    const result = await createAs(harness(verify), { 'pops-actor': PHONE_ACTOR });
    expect(result).toEqual({ status: 200, actor: { kind: 'web', id: null, label: null } });
    expect(verify).not.toHaveBeenCalled();
  });

  it('ignores Pops-Actor from a key granted only the mutations route, recording the service', async () => {
    const result = await createAs(harness(granting(['inventory.sync.mutations'], 'importer')), {
      'x-api-key': SYNC_KEY,
      'pops-actor': PHONE_ACTOR,
    });
    expect(result).toEqual({
      status: 200,
      actor: { kind: 'service', id: 'importer', label: null },
    });
  });

  it('records the service when an inventory.sync caller names no device', async () => {
    const result = await createAs(harness(granting(['inventory.sync'])), {
      'x-api-key': SYNC_KEY,
    });
    expect(result.actor).toEqual({ kind: 'service', id: 'bfm', label: null });
  });

  it('400s a malformed Pops-Actor from an inventory.sync caller and writes nothing', async () => {
    const target = harness(granting(['inventory.sync']));
    const before = target.db.db.select().from(events).all().length;
    const result = await createAs(target, { 'x-api-key': SYNC_KEY, 'pops-actor': 'phone' });
    expect(result.status).toBe(400);
    expect(target.db.db.select().from(events).all()).toHaveLength(before);
  });
});

describe('parseActorHeader', () => {
  it.each([
    ['no device prefix', 'dev_1;label=Phone'],
    ['no label', 'device:dev_1'],
    ['an empty label', 'device:dev_1;label='],
    ['broken percent-encoding', 'device:dev_1;label=%E2%80'],
    ['a label over 100 characters', `device:dev_1;label=${'a'.repeat(101)}`],
    ['whitespace in the id', 'device:dev 1;label=Phone'],
  ])('refuses %s', (_label, header) => {
    expect(() => parseActorHeader(header)).toThrow(/Pops-Actor/);
  });

  it('accepts a label of exactly 100 characters', () => {
    expect(parseActorHeader(`device:d;label=${'a'.repeat(100)}`).label).toHaveLength(100);
  });
});

describe('resolveActor', () => {
  it.each([
    [{ outcome: 'rejected' } as const, 401],
    [{ outcome: 'unavailable' } as const, 503],
  ])(
    'refuses rather than demotes a key that no longer verifies (%j)',
    async (verification, status) => {
      await expect(
        resolveActor({
          apiKey: SYNC_KEY,
          actorHeader: PHONE_ACTOR,
          verify: () => Promise.resolve(verification),
        })
      ).rejects.toMatchObject({ status });
    }
  );

  it('treats an empty key as no key', async () => {
    const verify = vi.fn(granting(['inventory.sync']));
    await expect(resolveActor({ apiKey: '', actorHeader: PHONE_ACTOR, verify })).resolves.toEqual({
      kind: 'web',
    });
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('scopes derived for the sync surface', () => {
  it('maps every sync route to inventory.sync, inventory.types or inventory.codes', () => {
    const scopes = inventoryScopeMap.routes
      .filter((route) => /^\/(sync|types|codes)(\/|$)/.test(route.path))
      .map((route) => `${route.method} ${route.path} ${route.scope}`)
      .toSorted();
    expect(scopes).toEqual([
      'GET /sync/changes inventory.sync.changes',
      'GET /sync/items/:id/events inventory.sync.itemEvents',
      'GET /sync/snapshot inventory.sync.snapshot',
      'GET /types inventory.types.catalogue',
      'POST /codes/suggest inventory.codes.suggest',
      'POST /sync/ledger inventory.sync.reportLedger',
      'POST /sync/mutations inventory.sync.mutations',
    ]);
  });

  it('403s a purchases-shaped key on the sync surface', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const target = harness(granting(['inventory.items'], 'purchases'));
    const response = await target.api
      .get('/sync/snapshot')
      .set({ ...PROTOCOL, 'x-api-key': SYNC_KEY });
    expect(response.status).toBe(403);
  });

  it('admits a types-only key to the catalogue and nowhere else in sync', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const target = harness(granting(['inventory.types']));
    const headers = { ...PROTOCOL, 'x-api-key': SYNC_KEY };
    const [types, snapshot, codes] = await Promise.all([
      target.api.get('/types').set(headers),
      target.api.get('/sync/snapshot').set(headers),
      target.api.post('/codes/suggest').set(headers).send({ name: 'Box' }),
    ]);
    expect([types.status, snapshot.status, codes.status]).toEqual([200, 403, 403]);
  });
});
