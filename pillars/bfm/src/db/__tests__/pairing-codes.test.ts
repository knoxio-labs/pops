import { readFileSync } from 'node:fs';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pairingCodes } from '../schema.js';
import { hashSecret, openTempDb, pairingCodeRow, requireRow } from './helpers.js';

import type { OpenedBfmDb } from '../index.js';

let opened: OpenedBfmDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
});

afterEach(() => {
  cleanup();
});

describe('a pairing code row', () => {
  it('starts unconsumed and carries an ISO-8601 creation instant', () => {
    const row = pairingCodeRow();
    opened.db.insert(pairingCodes).values(row).run();

    const stored = requireRow(opened.db.select().from(pairingCodes).get(), 'pairing code');
    expect(stored.consumedAt).toBeNull();
    expect(stored.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(stored.expiresAt).toBe(row.expiresAt);
  });

  it('is keyed by its hash, so the same code cannot be minted twice', () => {
    const row = pairingCodeRow();
    opened.db.insert(pairingCodes).values(row).run();

    expect(() =>
      opened.db
        .insert(pairingCodes)
        .values(pairingCodeRow({ codeHash: row.codeHash }))
        .run()
    ).toThrow(/UNIQUE|PRIMARY KEY/i);
  });

  it('records consumption once', () => {
    const row = pairingCodeRow();
    opened.db.insert(pairingCodes).values(row).run();

    const consumedAt = new Date().toISOString();
    opened.db
      .update(pairingCodes)
      .set({ consumedAt })
      .where(eq(pairingCodes.codeHash, row.codeHash))
      .run();

    const stored = requireRow(opened.db.select().from(pairingCodes).get(), 'consumed code');
    expect(stored.consumedAt).toBe(consumedAt);
  });

  it('refuses a code that expires before it exists', () => {
    // The guard against TTL arithmetic that went the wrong way. A code with
    // an expiry in the past is dead on arrival; one produced by a sign error
    // could as easily have been unbounded.
    expect(() =>
      opened.db
        .insert(pairingCodes)
        .values(pairingCodeRow({ expiresAt: '2000-01-01T00:00:00.000Z' }))
        .run()
    ).toThrow(/CHECK constraint failed/i);
  });
});

describe('what a stolen copy of bfm.db yields', () => {
  it('holds no trace of the plaintext behind a stored code hash', () => {
    // The invariant the table exists to hold: a database read must never
    // produce a usable credential. Asserted against the file's bytes rather
    // than the row, because a row assertion only covers the columns that
    // exist today — a plaintext column added later would pass it.
    const plaintext = 'PAIR-XKCD-7Q4M';
    opened.db
      .insert(pairingCodes)
      .values(pairingCodeRow({ codeHash: hashSecret(plaintext) }))
      .run();

    // Fold the WAL back into the main file so one read sees everything.
    opened.raw.pragma('wal_checkpoint(TRUNCATE)');
    const onDisk = readFileSync(opened.raw.name).toString('latin1');

    expect(onDisk).toContain(hashSecret(plaintext));
    expect(onDisk).not.toContain(plaintext);
  });
});
