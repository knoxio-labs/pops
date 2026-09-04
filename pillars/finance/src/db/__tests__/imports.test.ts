/**
 * Invariant tests for the imports persistence helpers.
 *
 * Entities are no longer mirrored in finance — `buildEntityMaps` and
 * `buildDefaultTagsByEntity` are PURE transforms over a contact set fetched
 * live from the contacts pillar, so they need no DB. `findExistingChecksums`
 * and `insertImportTransaction` run against an in-memory database carrying the
 * migrated finance schema.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { AccountNotFoundError, ImportTransactionPersistError } from '../errors.js';
import { transactions } from '../schema.js';
import { createAccount } from '../services/accounts.js';
import {
  buildDefaultTagsByEntity,
  buildEntityMaps,
  findExistingChecksums,
  insertImportTransaction,
} from '../services/imports.js';
import { freshMigratedFinanceDb } from './migrated-db.js';
import { seededAccountId } from './seeded-account.js';

import type { ContactEntity } from '../../api/contacts/client.js';
import type { InsertImportTransactionInput } from '../services/imports.js';
import type { FinanceDb } from '../services/internal.js';
import type { MigratedFinanceDb } from './migrated-db.js';

type TestHarness = MigratedFinanceDb;

function freshDb(): TestHarness {
  return freshMigratedFinanceDb();
}

function contact(over: Partial<ContactEntity> & { name: string }): ContactEntity {
  return {
    id: over.id ?? crypto.randomUUID(),
    name: over.name,
    type: over.type ?? 'company',
    abn: over.abn ?? null,
    aliases: over.aliases ?? [],
    defaultTransactionType: over.defaultTransactionType ?? null,
    defaultTags: over.defaultTags ?? [],
    notes: over.notes ?? null,
    lastEditedTime: over.lastEditedTime ?? '2026-01-01T00:00:00.000Z',
  };
}

function seedTransaction(
  db: FinanceDb,
  input: { description?: string; checksum?: string | null; date?: string; account?: string }
): string {
  const id = crypto.randomUUID();
  db.insert(transactions)
    .values({
      id,
      description: input.description ?? 'seed txn',
      accountId: seededAccountId(db, input.account ?? 'amex'),
      amountCents: -1000,
      date: input.date ?? '2026-01-01',
      type: 'purchase',
      tags: '[]',
      entityId: null,
      entityName: null,
      location: null,
      checksum: input.checksum ?? null,
      rawRow: null,
      lastEditedTime: new Date().toISOString(),
    })
    .run();
  return id;
}

describe('findExistingChecksums', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('returns an empty set without querying when the input is empty', () => {
    expect(findExistingChecksums(harness.db, []).size).toBe(0);
  });

  it('returns only the checksums that already exist', () => {
    seedTransaction(harness.db, { checksum: 'aaa' });
    seedTransaction(harness.db, { checksum: 'bbb' });
    seedTransaction(harness.db, { checksum: 'ccc' });

    const result = findExistingChecksums(harness.db, ['aaa', 'bbb', 'ddd']);

    expect([...result].toSorted()).toEqual(['aaa', 'bbb']);
  });

  it('ignores transactions with a null checksum', () => {
    seedTransaction(harness.db, { checksum: null });
    seedTransaction(harness.db, { checksum: 'kept' });
    expect([...findExistingChecksums(harness.db, ['kept'])]).toEqual(['kept']);
  });

  it('handles input larger than the 500-row batch size', () => {
    const present: string[] = [];
    for (let i = 0; i < 25; i++) {
      const checksum = `present-${i}`;
      seedTransaction(harness.db, { checksum });
      present.push(checksum);
    }
    const absent: string[] = [];
    for (let i = 0; i < 1200; i++) absent.push(`absent-${i}`);

    const result = findExistingChecksums(harness.db, [...absent, ...present]);

    expect(result.size).toBe(present.length);
    for (const c of present) expect(result.has(c)).toBe(true);
  });
});

describe('buildEntityMaps', () => {
  it('returns empty maps for an empty contact set', () => {
    const { entityLookup, aliasMap } = buildEntityMaps([]);
    expect(entityLookup.size).toBe(0);
    expect(aliasMap.size).toBe(0);
  });

  it('keys the lookup by lowercased name but stores the original case', () => {
    const { entityLookup } = buildEntityMaps([contact({ id: 'e1', name: 'Coles Express' })]);
    expect(entityLookup.get('coles express')).toEqual({
      id: 'e1',
      name: 'Coles Express',
      type: 'company',
    });
    expect(entityLookup.has('Coles Express')).toBe(false);
  });

  it('maps each lowercased alias to the entity name in original case', () => {
    const { aliasMap } = buildEntityMaps([
      contact({ name: 'Woolworths', aliases: ['WW', 'Woolies', 'woolworths group'] }),
    ]);
    expect(aliasMap.get('ww')).toBe('Woolworths');
    expect(aliasMap.get('woolies')).toBe('Woolworths');
    expect(aliasMap.get('woolworths group')).toBe('Woolworths');
  });

  it('drops whitespace-only alias entries', () => {
    const { aliasMap } = buildEntityMaps([
      contact({ name: 'Aldi', aliases: ['ALDI', ' ', '', 'aldi store'] }),
    ]);
    expect(aliasMap.size).toBe(2);
    expect(aliasMap.get('aldi')).toBe('Aldi');
    expect(aliasMap.get('aldi store')).toBe('Aldi');
  });

  it('keeps a single winner when two contacts share an alias', () => {
    const { aliasMap } = buildEntityMaps([
      contact({ name: 'Cafe One', aliases: ['shared'] }),
      contact({ name: 'Cafe Two', aliases: ['shared'] }),
    ]);
    expect(aliasMap.size).toBe(1);
    const winner = aliasMap.get('shared');
    expect(winner === 'Cafe One' || winner === 'Cafe Two').toBe(true);
  });
});

describe('buildDefaultTagsByEntity', () => {
  it('maps contact id to its defaultTags, skipping contacts with none', () => {
    const map = buildDefaultTagsByEntity([
      contact({ id: 'a', name: 'A', defaultTags: ['food', 'rent'] }),
      contact({ id: 'b', name: 'B', defaultTags: [] }),
    ]);
    expect(map.get('a')).toEqual(['food', 'rent']);
    expect(map.has('b')).toBe(false);
  });
});

describe('insertImportTransaction', () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = freshDb();
  });

  it('persists the supplied fields and round-trips them, incl. a non-local entity id', () => {
    const row = insertImportTransaction(harness.db, {
      description: 'Espresso',
      account: 'amex',
      amountCents: -450,
      date: '2026-02-14',
      type: 'purchase',
      tags: ['Coffee', 'Outings'],
      // A contacts entity id with no local referent — the dropped FK lets it in.
      entityId: 'contacts-entity-id',
      entityName: 'Acme',
      location: 'Sydney',
      rawRow: 'csv,row,here',
      checksum: 'chk-1',
    });

    expect(row.tags).toBe('["Coffee","Outings"]');
    expect(row.entityId).toBe('contacts-entity-id');
    expect(row.entityName).toBe('Acme');
    expect(row.checksum).toBe('chk-1');
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('serialises empty tags as a JSON array and defaults rawRow/checksum to null', () => {
    const row = insertImportTransaction(harness.db, {
      description: 'No tags',
      account: 'amex',
      amountCents: -100,
      date: '2026-02-15',
      type: 'purchase',
      tags: [],
      entityId: null,
      entityName: null,
      location: null,
    });
    expect(row.tags).toBe('[]');
    expect(row.rawRow).toBeNull();
    expect(row.checksum).toBeNull();
  });

  it('lets two rows share a checksum, leaving dedup to findExistingChecksums', () => {
    // `0059_recompute_canonical_checksum` re-keyed every row to a checksum
    // derived from the charge alone and dropped the UNIQUE index, because two
    // genuinely distinct charges can hash the same. Dedup moved to the commit
    // path, which asks `findExistingChecksums` first.
    const base: Omit<InsertImportTransactionInput, 'description'> = {
      account: 'amex',
      amountCents: -100,
      date: '2026-02-15',
      type: 'purchase',
      tags: [],
      entityId: null,
      entityName: null,
      location: null,
      checksum: 'dup',
    };
    insertImportTransaction(harness.db, { ...base, description: 'first' });
    insertImportTransaction(harness.db, { ...base, description: 'second' });

    expect(findExistingChecksums(harness.db, ['dup'])).toEqual(new Set(['dup']));
  });

  it('commits against the picked accountId, not an account that happens to name-match the dialect label (POPS-2852)', () => {
    // Seed a SECOND account whose real name coincides with the seeded "Amex"
    // account's dialect label ("amex", case-insensitively equal to the
    // migration's seeded "Amex"). Before POPS-2852, `insertImportTransaction`
    // name-matched `account` alone, so this row would have landed on the
    // WRONG account — the one whose name happens to equal the dialect string —
    // regardless of which account the wizard's user actually picked.
    const pickedAccount = createAccount(harness.db, {
      name: 'Amex Business',
      kind: 'credit-card',
      currency: 'AUD',
    });
    const nameMatchedAccountId = seededAccountId(harness.db, 'amex');
    expect(nameMatchedAccountId).not.toBe(pickedAccount.id);

    const row = insertImportTransaction(harness.db, {
      description: 'Espresso',
      account: 'amex',
      accountId: pickedAccount.id,
      amountCents: -450,
      date: '2026-02-14',
      type: 'purchase',
      tags: [],
      entityId: null,
      entityName: null,
      location: null,
    });

    expect(row.accountId).toBe(pickedAccount.id);
    expect(row.accountId).not.toBe(nameMatchedAccountId);
  });

  it('falls back to name-matching `account` when no accountId is supplied (legacy caller)', () => {
    const row = insertImportTransaction(harness.db, {
      description: 'Espresso',
      account: 'amex',
      amountCents: -450,
      date: '2026-02-14',
      type: 'purchase',
      tags: [],
      entityId: null,
      entityName: null,
      location: null,
    });

    expect(row.accountId).toBe(seededAccountId(harness.db, 'amex'));
  });

  it('throws AccountNotFoundError for a stale/unknown accountId rather than silently name-matching', () => {
    expect(() =>
      insertImportTransaction(harness.db, {
        description: 'Espresso',
        account: 'amex',
        accountId: 'not-a-real-account-id',
        amountCents: -450,
        date: '2026-02-14',
        type: 'purchase',
        tags: [],
        entityId: null,
        entityName: null,
        location: null,
      })
    ).toThrow(AccountNotFoundError);
  });

  it('rolls back when used inside a transaction that aborts', () => {
    expect(() =>
      harness.db.transaction(() => {
        insertImportTransaction(harness.db, {
          description: 'rolled back',
          account: 'amex',
          amountCents: -100,
          date: '2026-02-15',
          type: 'purchase',
          tags: [],
          entityId: null,
          entityName: null,
          location: null,
          checksum: 'rb',
        });
        throw new Error('abort');
      })
    ).toThrow('abort');

    expect(findExistingChecksums(harness.db, ['rb']).size).toBe(0);
  });
});

describe('ImportTransactionPersistError', () => {
  it('exposes the offending id on the thrown instance', () => {
    const err = new ImportTransactionPersistError('abc');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ImportTransactionPersistError');
    expect(err.id).toBe('abc');
    expect(err.message).toContain('abc');
  });
});
