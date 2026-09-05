/**
 * Invariant tests for the account-checkpoint service against an in-memory
 * SQLite carrying the migrated finance schema (POPS-2878, ADR-051).
 *
 * Three things are only true because of SQL, and are checked through it: the
 * `ON DELETE CASCADE` this table alone carries, the PARTIAL unique index that
 * excludes `manual`, and the newest-wins ordering two rows on one date rely on.
 */
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { CheckpointSourceNotDeletableError } from '../errors.js';
import {
  deleteCheckpoint,
  earliestCheckpointAfter,
  getCheckpoint,
  insertCheckpoint,
  latestCheckpointAtOrBefore,
  listCheckpoints,
} from '../services/account-checkpoints.js';
import { createAccount } from '../services/accounts.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type { FinanceDb } from '../services/internal.js';

let db: FinanceDb;
let accountId: string;
let otherAccountId: string;

beforeEach(() => {
  db = freshMigratedFinanceDb().db;
  accountId = createAccount(db, { name: 'Everyday', kind: 'checking', currency: 'AUD' }).id;
  otherAccountId = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' }).id;
});

describe('insertCheckpoint', () => {
  it('stores a ledger-signed balance unchanged, negative for money owed', () => {
    const card = createAccount(db, { name: 'Amex Platinum', kind: 'credit-card', currency: 'AUD' });
    const row = insertCheckpoint(db, {
      accountId: card.id,
      balanceCents: -213_755,
      asOf: '2026-09-02',
      source: 'manual',
    });
    expect(row.balanceCents).toBe(-213_755);
    expect(getCheckpoint(db, row.id)?.balanceCents).toBe(-213_755);
  });

  it('defaults sourceRef and note to null rather than undefined', () => {
    const row = insertCheckpoint(db, {
      accountId,
      balanceCents: 1000,
      asOf: '2026-01-01',
      source: 'manual',
    });
    expect(row.sourceRef).toBeNull();
    expect(row.note).toBeNull();
  });

  it('rejects a second import row for the same account and date', () => {
    insertCheckpoint(db, {
      accountId,
      balanceCents: 1000,
      asOf: '2026-01-01',
      source: 'import',
      sourceRef: 'commit-1',
    });
    expect(() =>
      insertCheckpoint(db, {
        accountId,
        balanceCents: 2000,
        asOf: '2026-01-01',
        source: 'import',
        sourceRef: 'commit-2',
      })
    ).toThrow(/UNIQUE/i);
  });

  it('accepts a second manual row for the same account and date', () => {
    insertCheckpoint(db, { accountId, balanceCents: 1000, asOf: '2026-01-01', source: 'manual' });
    expect(() =>
      insertCheckpoint(db, { accountId, balanceCents: 1100, asOf: '2026-01-01', source: 'manual' })
    ).not.toThrow();
    expect(listCheckpoints(db, accountId)).toHaveLength(2);
  });

  it('lets an import and a statement row share a date — the index keys on source too', () => {
    insertCheckpoint(db, { accountId, balanceCents: 1000, asOf: '2026-01-01', source: 'import' });
    expect(() =>
      insertCheckpoint(db, {
        accountId,
        balanceCents: 1000,
        asOf: '2026-01-01',
        source: 'statement',
      })
    ).not.toThrow();
  });

  it('does not collide across accounts', () => {
    insertCheckpoint(db, { accountId, balanceCents: 1000, asOf: '2026-01-01', source: 'import' });
    expect(() =>
      insertCheckpoint(db, {
        accountId: otherAccountId,
        balanceCents: 1000,
        asOf: '2026-01-01',
        source: 'import',
      })
    ).not.toThrow();
  });
});

describe('listCheckpoints', () => {
  it('returns newest first and only this account rows', () => {
    insertCheckpoint(db, { accountId, balanceCents: 1, asOf: '2026-01-01', source: 'manual' });
    insertCheckpoint(db, { accountId, balanceCents: 2, asOf: '2026-06-01', source: 'manual' });
    insertCheckpoint(db, { accountId, balanceCents: 3, asOf: '2026-03-01', source: 'manual' });
    insertCheckpoint(db, {
      accountId: otherAccountId,
      balanceCents: 9,
      asOf: '2026-12-01',
      source: 'manual',
    });

    expect(listCheckpoints(db, accountId).map((r) => r.asOf)).toEqual([
      '2026-06-01',
      '2026-03-01',
      '2026-01-01',
    ]);
  });

  it('is empty for an account with no checkpoints', () => {
    expect(listCheckpoints(db, otherAccountId)).toEqual([]);
  });
});

describe('latestCheckpointAtOrBefore', () => {
  beforeEach(() => {
    insertCheckpoint(db, { accountId, balanceCents: 100, asOf: '2026-01-31', source: 'manual' });
    insertCheckpoint(db, { accountId, balanceCents: 200, asOf: '2026-06-30', source: 'manual' });
  });

  it('includes a checkpoint dated exactly on the date asked for', () => {
    expect(latestCheckpointAtOrBefore(db, accountId, '2026-06-30')?.balanceCents).toBe(200);
  });

  it('picks the nearest earlier checkpoint, not the newest overall', () => {
    expect(latestCheckpointAtOrBefore(db, accountId, '2026-06-29')?.balanceCents).toBe(100);
  });

  it('is undefined before the first checkpoint', () => {
    expect(latestCheckpointAtOrBefore(db, accountId, '2026-01-30')).toBeUndefined();
  });

  it('picks the newest created_at when two checkpoints share a date', () => {
    const first = insertCheckpoint(db, {
      accountId: otherAccountId,
      balanceCents: 500,
      asOf: '2026-08-20',
      source: 'manual',
      note: 'counted in a hurry',
    });
    // `created_at` has millisecond resolution and both inserts land inside
    // one, so the tie is forced rather than raced.
    db.run(
      sql`UPDATE account_checkpoints SET created_at = '2026-08-20T09:00:00.000Z' WHERE id = ${first.id}`
    );
    const second = insertCheckpoint(db, {
      accountId: otherAccountId,
      balanceCents: 520,
      asOf: '2026-08-20',
      source: 'manual',
      note: 'counted again, properly',
    });
    db.run(
      sql`UPDATE account_checkpoints SET created_at = '2026-08-20T10:00:00.000Z' WHERE id = ${second.id}`
    );

    expect(latestCheckpointAtOrBefore(db, otherAccountId, '2026-08-20')?.balanceCents).toBe(520);
  });
});

describe('earliestCheckpointAfter', () => {
  beforeEach(() => {
    insertCheckpoint(db, { accountId, balanceCents: 100, asOf: '2026-01-31', source: 'manual' });
    insertCheckpoint(db, { accountId, balanceCents: 200, asOf: '2026-06-30', source: 'manual' });
  });

  it('excludes a checkpoint dated exactly on the date asked for', () => {
    expect(earliestCheckpointAfter(db, accountId, '2026-01-31')?.balanceCents).toBe(200);
  });

  it('picks the nearest later checkpoint', () => {
    expect(earliestCheckpointAfter(db, accountId, '2025-12-01')?.balanceCents).toBe(100);
  });

  it('is undefined after the last checkpoint', () => {
    expect(earliestCheckpointAfter(db, accountId, '2026-06-30')).toBeUndefined();
  });
});

describe('deleteCheckpoint', () => {
  it('removes a manual row and reports it', () => {
    const row = insertCheckpoint(db, {
      accountId,
      balanceCents: 100,
      asOf: '2026-01-01',
      source: 'manual',
    });
    expect(deleteCheckpoint(db, row.id)).toBe(true);
    expect(getCheckpoint(db, row.id)).toBeUndefined();
  });

  it('refuses an import row and leaves it in place', () => {
    const row = insertCheckpoint(db, {
      accountId,
      balanceCents: 100,
      asOf: '2026-01-01',
      source: 'import',
      sourceRef: 'commit-1',
    });
    expect(() => deleteCheckpoint(db, row.id)).toThrow(CheckpointSourceNotDeletableError);
    expect(getCheckpoint(db, row.id)).toBeDefined();
  });

  it('refuses a statement row', () => {
    const row = insertCheckpoint(db, {
      accountId,
      balanceCents: 100,
      asOf: '2026-01-01',
      source: 'statement',
      sourceRef: 'doc-1',
    });
    expect(() => deleteCheckpoint(db, row.id)).toThrow(CheckpointSourceNotDeletableError);
  });

  it('reports false for an id that does not exist', () => {
    expect(deleteCheckpoint(db, 'nope')).toBe(false);
  });
});

describe('account_checkpoints foreign key', () => {
  it('cascades when the account row is hard-deleted', () => {
    insertCheckpoint(db, { accountId, balanceCents: 100, asOf: '2026-01-01', source: 'manual' });
    insertCheckpoint(db, {
      accountId: otherAccountId,
      balanceCents: 200,
      asOf: '2026-01-01',
      source: 'manual',
    });

    db.run(sql`DELETE FROM accounts WHERE id = ${accountId}`);

    expect(listCheckpoints(db, accountId)).toEqual([]);
    expect(listCheckpoints(db, otherAccountId)).toHaveLength(1);
  });

  it('refuses a checkpoint for an account that does not exist', () => {
    expect(() =>
      insertCheckpoint(db, {
        accountId: 'no-such-account',
        balanceCents: 100,
        asOf: '2026-01-01',
        source: 'manual',
      })
    ).toThrow(/FOREIGN KEY/i);
  });
});
