/**
 * Integration tests for the `accounts.*` REST surface (POPS-2767). Covers
 * the full CRUD surface: create/list/get round-tripping, the name 409
 * conflict mapping, update (including unarchive via `archivedAt: null`),
 * and delete-as-archive.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { ContactsPermanentError } from '../contacts/client.js';
import { startReconcileContactsOutboxWorker } from '../cron/reconcile-contacts-outbox.js';
import { makeContactsFake, type ContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-accounts-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client(contacts: ContactsFake = makeContactsFake()) {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts,
    })
  );
}

describe('accounts — happy paths', () => {
  it('starts with the two migration-seeded accounts', async () => {
    const { data } = await client().accounts.list();
    expect(data.map((a) => a.name).toSorted()).toEqual(['ANZ Credit Card', 'Amex']);
  });

  it('creates an account and round-trips it through list and get', async () => {
    const created = await client().accounts.create({
      name: 'Wallet',
      kind: 'cash',
      currency: 'AUD',
    });
    expect(created.data).toMatchObject({
      name: 'Wallet',
      kind: 'cash',
      currency: 'AUD',
      institutionId: null,
      archivedAt: null,
    });
    expect(created.message).toBe('Account created');

    const { data } = await client().accounts.list();
    expect(data.map((a) => a.name)).toContain('Wallet');

    const fetched = await client().accounts.get(created.data.id);
    expect(fetched.data.id).toBe(created.data.id);
  });

  it('links a new account to an institution', async () => {
    const institution = await client().institutions.create({ name: 'Westpac', colour: '#d5001c' });
    const created = await client().accounts.create({
      name: 'Westpac Everyday',
      kind: 'checking',
      currency: 'AUD',
      institutionId: institution.data.id,
    });
    expect(created.data.institutionId).toBe(institution.data.id);
  });

  it('updates an account', async () => {
    const created = await client().accounts.create({
      name: 'Wallet',
      kind: 'cash',
      currency: 'AUD',
    });
    const updated = await client().accounts.update(created.data.id, { displayOrder: 3 });
    expect(updated.data.displayOrder).toBe(3);
    expect(updated.message).toBe('Account updated');
  });

  it('archives an account on delete, and it still appears in list', async () => {
    const created = await client().accounts.create({
      name: 'Wallet',
      kind: 'cash',
      currency: 'AUD',
    });

    const archived = await client().accounts.delete(created.data.id);
    expect(archived.data.archivedAt).not.toBeNull();
    expect(archived.message).toBe('Account archived');

    const { data } = await client().accounts.list();
    const found = data.find((a) => a.id === created.data.id);
    expect(found?.archivedAt).not.toBeNull();
  });

  it('unarchives by patching archivedAt back to null', async () => {
    const created = await client().accounts.create({
      name: 'Wallet',
      kind: 'cash',
      currency: 'AUD',
    });
    await client().accounts.delete(created.data.id);

    const restored = await client().accounts.update(created.data.id, { archivedAt: null });
    expect(restored.data.archivedAt).toBeNull();
  });
});

describe('accounts — list query filters', () => {
  it('filters by search substring, case-insensitively', async () => {
    await client().accounts.create({ name: 'Travel Wallet', kind: 'cash', currency: 'AUD' });
    await client().accounts.create({ name: 'Savings A', kind: 'savings', currency: 'AUD' });

    const { data } = await client().accounts.list({ search: 'wallet' });
    expect(data.map((a) => a.name)).toEqual(['Travel Wallet']);
  });

  it('filters by exact kind', async () => {
    await client().accounts.create({ name: 'Wallet', kind: 'cash', currency: 'AUD' });

    const { data } = await client().accounts.list({ kind: 'cash' });
    expect(data.map((a) => a.name)).toEqual(['Wallet']);
  });

  it('filters to archived-only or active-only, and returns both when omitted', async () => {
    const created = await client().accounts.create({
      name: 'Wallet',
      kind: 'cash',
      currency: 'AUD',
    });
    await client().accounts.delete(created.data.id);

    const archivedOnly = await client().accounts.list({ archived: 'true' });
    expect(archivedOnly.data.map((a) => a.id)).toEqual([created.data.id]);

    const activeOnly = await client().accounts.list({ archived: 'false' });
    expect(activeOnly.data.map((a) => a.id)).not.toContain(created.data.id);

    const all = await client().accounts.list();
    expect(all.data.map((a) => a.id)).toContain(created.data.id);
  });

  it('paginates with limit/offset and reports the true total', async () => {
    const page1 = await client().accounts.list({ limit: 1, offset: 0 });
    expect(page1.data).toHaveLength(1);
    expect(page1.pagination).toMatchObject({ total: 2, limit: 1, offset: 0, hasMore: true });

    const page2 = await client().accounts.list({ limit: 1, offset: 1 });
    expect(page2.data).toHaveLength(1);
    expect(page2.pagination).toMatchObject({ total: 2, limit: 1, offset: 1, hasMore: false });
    expect(page2.data[0]?.id).not.toBe(page1.data[0]?.id);
  });
});

describe('accounts — reserved kinds', () => {
  it.each(['shared', 'novated-lease', 'crypto', 'other'] as const)(
    '422s creating kind %s',
    async (kind) => {
      await expect(
        client().accounts.create({ name: 'Reserved', kind, currency: 'AUD' })
      ).rejects.toMatchObject({ status: 422 });
    }
  );

  it('still allows creating a day-one kind', async () => {
    await expect(
      client().accounts.create({ name: 'Wallet', kind: 'cash', currency: 'AUD' })
    ).resolves.toMatchObject({ data: { kind: 'cash' } });
  });
});

describe('accounts — reorder', () => {
  it('applies every entry in the batch atomically', async () => {
    const a = await client().accounts.create({ name: 'Alpha', kind: 'cash', currency: 'AUD' });
    const b = await client().accounts.create({ name: 'Beta', kind: 'savings', currency: 'AUD' });

    const reordered = await client().accounts.reorder({
      accounts: [
        { id: a.data.id, displayOrder: 5 },
        { id: b.data.id, displayOrder: 1 },
      ],
    });

    expect(reordered.data.find((r) => r.id === a.data.id)?.displayOrder).toBe(5);
    expect(reordered.data.find((r) => r.id === b.data.id)?.displayOrder).toBe(1);

    const fetchedA = await client().accounts.get(a.data.id);
    expect(fetchedA.data.displayOrder).toBe(5);
  });

  it('404s the whole batch and leaves display order untouched when one id is unknown', async () => {
    const a = await client().accounts.create({ name: 'Alpha', kind: 'cash', currency: 'AUD' });
    const b = await client().accounts.create({ name: 'Beta', kind: 'savings', currency: 'AUD' });

    await expect(
      client().accounts.reorder({
        accounts: [
          { id: a.data.id, displayOrder: 5 },
          { id: 'missing-id', displayOrder: 1 },
          { id: b.data.id, displayOrder: 2 },
        ],
      })
    ).rejects.toMatchObject({ status: 404 });

    const fetchedA = await client().accounts.get(a.data.id);
    const fetchedB = await client().accounts.get(b.data.id);
    expect(fetchedA.data.displayOrder).toBe(0);
    expect(fetchedB.data.displayOrder).toBe(0);
  });
});

describe('accounts — error mapping', () => {
  it('409s a duplicate name', async () => {
    await client().accounts.create({ name: 'Wallet', kind: 'cash', currency: 'AUD' });

    await expect(
      client().accounts.create({ name: 'Wallet', kind: 'savings', currency: 'AUD' })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('allows a second cash account in the same currency (POPS-2775)', async () => {
    await client().accounts.create({ name: 'Wallet AUD', kind: 'cash', currency: 'AUD' });

    await expect(
      client().accounts.create({ name: 'Wallet AUD 2', kind: 'cash', currency: 'AUD' })
    ).resolves.toMatchObject({ data: { kind: 'cash', currency: 'AUD' } });
  });

  it('400s an unknown kind', async () => {
    await expect(
      client().accounts.create({ name: 'Wallet', kind: 'bitcoin-wallet', currency: 'AUD' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('400s a missing name', async () => {
    await expect(client().accounts.create({ kind: 'cash', currency: 'AUD' })).rejects.toMatchObject(
      {
        status: 400,
      }
    );
  });

  it('404s getting a missing account', async () => {
    await expect(client().accounts.get('missing-id')).rejects.toMatchObject({ status: 404 });
  });

  it('404s updating a missing account', async () => {
    await expect(client().accounts.update('missing-id', { displayOrder: 1 })).rejects.toMatchObject(
      {
        status: 404,
      }
    );
  });

  it('404s archiving a missing account', async () => {
    await expect(client().accounts.delete('missing-id')).rejects.toMatchObject({ status: 404 });
  });
});

describe('accounts — person accounts (POPS-2771)', () => {
  it('a non-person account is unaffected — no contacts call, entityId stays null', async () => {
    const contacts = makeContactsFake();
    contacts.createOrFetchByName = () => {
      throw new Error('should not be called for a non-person account');
    };
    await expect(
      client(contacts).accounts.create({ name: 'Wallet', kind: 'cash', currency: 'AUD' })
    ).resolves.toMatchObject({ data: { kind: 'cash', entityId: null } });
  });

  it('contacts up: resolves the contact and links entityId synchronously', async () => {
    const contacts = makeContactsFake();
    const created = await client(contacts).accounts.create({
      name: 'Alice',
      kind: 'person',
      currency: 'AUD',
    });

    expect(created.data.entityId).not.toBeNull();
    expect(created.data.entityDisplayName).toBe('Alice');
    expect(created.data.entityDisplayNameStale).toBe(false);
    expect(contacts.entities.map((e) => e.name)).toContain('Alice');
  });

  it('contacts down: the account is created immediately with entityId null, queued in the outbox', async () => {
    const contacts = makeContactsFake({ unavailable: true });
    const created = await client(contacts).accounts.create({
      name: 'Bob',
      kind: 'person',
      currency: 'AUD',
    });

    expect(created.data.entityId).toBeNull();
    // Degrades to the stored name with no staleness flag — nothing has been
    // resolved yet, this isn't a refresh failure.
    expect(created.data.entityDisplayName).toBe('Bob');
    expect(created.data.entityDisplayNameStale).toBe(false);

    const fetched = await client(contacts).accounts.get(created.data.id);
    expect(fetched.data.entityId).toBeNull();
  });

  it('drain resolves the pending create once contacts recovers', async () => {
    const contacts = makeContactsFake({ unavailable: true });
    const created = await client(contacts).accounts.create({
      name: 'Carol',
      kind: 'person',
      currency: 'AUD',
    });
    expect(created.data.entityId).toBeNull();

    contacts.setUnavailable(false);
    const handle = startReconcileContactsOutboxWorker({
      db: financeDb.db,
      contacts,
      intervalMs: 1_000_000,
    });
    await handle.runOnce();
    handle.stop();

    const resolved = await client(contacts).accounts.get(created.data.id);
    expect(resolved.data.entityId).not.toBeNull();
    expect(resolved.data.entityDisplayName).toBe('Carol');
    expect(resolved.data.entityDisplayNameStale).toBe(false);
  });

  it('409s a second person account for the same contact and currency', async () => {
    const contacts = makeContactsFake();
    const first = await client(contacts).accounts.create({
      name: 'Dana',
      kind: 'person',
      currency: 'AUD',
    });
    expect(first.data.entityId).not.toBeNull();

    await expect(
      client(contacts).accounts.create({
        name: 'Dana Again',
        kind: 'person',
        currency: 'AUD',
        entityId: first.data.entityId,
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('allows the same contact in a different currency', async () => {
    const contacts = makeContactsFake();
    const first = await client(contacts).accounts.create({
      name: 'Erin',
      kind: 'person',
      currency: 'AUD',
    });

    await expect(
      client(contacts).accounts.create({
        name: 'Erin USD',
        kind: 'person',
        currency: 'USD',
        entityId: first.data.entityId,
      })
    ).resolves.toMatchObject({ data: { currency: 'USD' } });
  });

  it('422s a non-person account carrying an entityId', async () => {
    await expect(
      client().accounts.create({ name: 'Wallet', kind: 'cash', currency: 'AUD', entityId: 'e-1' })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('propagates a PERMANENT contacts failure unhandled (500) when resolving a person account name', async () => {
    const contacts = makeContactsFake();
    contacts.createOrFetchByName = () => {
      throw new ContactsPermanentError('bad-request');
    };
    await expect(
      client(contacts).accounts.create({ name: 'Frank', kind: 'person', currency: 'AUD' })
    ).rejects.toMatchObject({ status: 500 });
  });

  it('list resolves entityDisplayName live and marks it stale when contacts is down', async () => {
    const contacts = makeContactsFake();
    const created = await client(contacts).accounts.create({
      name: 'Gail',
      kind: 'person',
      currency: 'AUD',
    });
    // Contacts renames the contact after the account was created.
    const entity = contacts.entities.find((e) => e.id === created.data.entityId);
    if (entity) entity.name = 'Gail Renamed';

    const up = await client(contacts).accounts.list({ kind: 'person' });
    const upRow = up.data.find((a) => a.id === created.data.id);
    expect(upRow?.entityDisplayName).toBe('Gail Renamed');
    expect(upRow?.entityDisplayNameStale).toBe(false);

    contacts.setUnavailable(true);
    const down = await client(contacts).accounts.list({ kind: 'person' });
    const downRow = down.data.find((a) => a.id === created.data.id);
    expect(downRow?.entityDisplayName).toBe('Gail');
    expect(downRow?.entityDisplayNameStale).toBe(true);
  });
});
