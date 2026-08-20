/**
 * What the migration chain does to data that was already stored in bfm.
 *
 * The rows below are seeded through `0000_bfm_init` and then met by every
 * later migration on reopen, so this covers what its finance/purchases
 * siblings cover: that `openBfmDb` is idempotent, that it takes a
 * pre-migration snapshot while entries are pending and removes it once they
 * land, that the schema's one real foreign key — `refresh_tokens.device_id`, plus
 * its self-reference through `replaced_by` — survives with `foreign_keys = ON`
 * enforced, and that a migration adding a column fills it for the rows that
 * predate it rather than leaving them at a default nobody chose.
 *
 * That last one is the load-bearing case for `0001_device_capabilities`: the
 * column defaults to the EMPTY grant, so a device paired before it landed
 * would have been silently locked out of every route it was using. The
 * backfill is what stops that, and it is asserted against the literal set the
 * migration writes rather than against the current vocabulary — a migration is
 * history and must not change when the vocabulary grows.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readMigrationJournal, stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { openBfmDb } from '../open-bfm-db.js';

import type { OpenedBfmDb } from '../open-bfm-db.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

/** The baseline every row here is seeded through, before any later migration. */
const BASELINE_TAG = '0000_bfm_init';

interface SeededDevice {
  readonly id: string;
  readonly name: string;
  readonly model: string;
  readonly publicKeyDer: string;
}

/** One plain device and one carrying the characters a rebuild is most likely to mangle. */
const DEVICES: readonly SeededDevice[] = [
  {
    id: 'd-iphone',
    name: "Joao's iPhone",
    model: 'iPhone16,2',
    publicKeyDer: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE/base64+padding==',
  },
  {
    id: 'd-ipad',
    name: 'kitchen "display" — 厨房',
    model: 'iPad13,1',
    publicKeyDer: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A',
  },
];

const CREATED_AT = '2026-01-01T00:00:00.000Z';
const REPLACED_EXPIRES_AT = '2026-01-08T00:00:00.000Z';
const REPLACED_AT = '2026-01-05T00:00:00.000Z';
const CURRENT_EXPIRES_AT = '2026-02-01T00:00:00.000Z';

let dir: string;
let dbPath: string;
let opened: OpenedBfmDb;

function seedThroughBaseline(): void {
  const staged = stageMigrationsThrough({
    migrationsFolder: MIGRATIONS_DIR,
    through: BASELINE_TAG,
    targetFolder: join(dir, 'staged-migrations'),
  });

  const raw = new Database(dbPath);
  raw.pragma('foreign_keys = ON');
  migrate(drizzle(raw), { migrationsFolder: staged });

  for (const device of DEVICES) {
    raw
      .prepare(
        `INSERT INTO devices (id, name, model, public_key_der, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(device.id, device.name, device.model, device.publicKeyDer, CREATED_AT, CREATED_AT);
  }

  // The current token in the family. Inserted first because `rt-replaced`
  // below references it through `replaced_by`, and the foreign key is
  // enforced immediately, not deferred.
  raw
    .prepare(
      `INSERT INTO refresh_tokens
         (token_hash, device_id, family_id, expires_at, created_at)
       VALUES ('rt-current', 'd-iphone', 'f-iphone', ?, ?)`
    )
    .run(CURRENT_EXPIRES_AT, REPLACED_AT);

  // The token it rotated out of, self-referencing the row above through
  // `replaced_by` — the exact relationship the opener's own doc comment
  // calls out as depending on `foreign_keys = ON`.
  raw
    .prepare(
      `INSERT INTO refresh_tokens
         (token_hash, device_id, family_id, expires_at, consumed_at, replaced_by, created_at)
       VALUES ('rt-replaced', 'd-iphone', 'f-iphone', ?, ?, 'rt-current', ?)`
    )
    .run(REPLACED_EXPIRES_AT, REPLACED_AT, CREATED_AT);

  // A second device's token, unreplaced, to prove a row with a null
  // `replaced_by` survives untouched alongside the chain above.
  raw
    .prepare(
      `INSERT INTO refresh_tokens
         (token_hash, device_id, family_id, expires_at, created_at)
       VALUES ('rt-ipad', 'd-ipad', 'f-ipad', ?, ?)`
    )
    .run(CURRENT_EXPIRES_AT, CREATED_AT);

  raw.close();
}

function rows<T>(sql: string): T[] {
  return opened.raw.prepare(sql).all() as T[];
}

function count(table: string): number {
  return (opened.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bfm-migration-safety-'));
  dbPath = join(dir, 'bfm.db');
  seedThroughBaseline();
  opened = openBfmDb(dbPath);
});

afterEach(() => {
  opened.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('reopening a populated bfm database against the current journal', () => {
  it('applies every journal entry exactly once', () => {
    const applied = rows<{ created_at: number }>(
      `SELECT created_at FROM __drizzle_migrations ORDER BY created_at`
    );
    expect(applied).toHaveLength(readMigrationJournal(MIGRATIONS_DIR).length);
  });

  it('loses no rows from any seeded table', () => {
    expect(count('devices')).toBe(DEVICES.length);
    expect(count('refresh_tokens')).toBe(3);
  });

  it('leaves no pre-migration snapshot behind once the pending entries land', () => {
    // Seeded through the baseline only, so every later entry IS applied on the
    // reopen and a snapshot is taken — the point here is that a successful run
    // removes it again rather than accumulating a copy of the database per
    // deployment. A snapshot still on disk means a migration threw.
    expect(readdirSync(dir).filter((name) => name.includes('.pre-migration-'))).toEqual([]);
  });

  it('grants the devices that predate the capability column what they had before it', () => {
    // Written out rather than read from `DEFAULT_DEVICE_CAPABILITIES`: the
    // migration froze this set on the day it landed, and it must not start
    // asserting a vocabulary that grew afterwards.
    const stored = rows<{ id: string; capabilities: string }>(
      `SELECT id, capabilities FROM devices ORDER BY id`
    );

    for (const device of stored) {
      expect(JSON.parse(device.capabilities)).toEqual([
        'session.read',
        'finance.transactions.read',
        'purchases.receipts.write',
      ]);
    }
    expect(stored).toHaveLength(DEVICES.length);
  });

  it('keeps every device column byte-identical, quotes and unicode included', () => {
    const stored = rows<{ id: string; name: string; model: string; public_key_der: string }>(
      `SELECT id, name, model, public_key_der FROM devices ORDER BY id`
    );
    expect(stored).toEqual(
      [...DEVICES]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((device) => ({
          id: device.id,
          name: device.name,
          model: device.model,
          public_key_der: device.publicKeyDer,
        }))
    );
  });

  it('keeps the self-referencing replacement chain intact', () => {
    const replaced = opened.raw
      .prepare(`SELECT replaced_by, consumed_at FROM refresh_tokens WHERE token_hash = ?`)
      .get('rt-replaced') as { replaced_by: string | null; consumed_at: string | null };
    expect(replaced.replaced_by).toBe('rt-current');
    expect(replaced.consumed_at).toBe(REPLACED_AT);

    const current = opened.raw
      .prepare(`SELECT replaced_by FROM refresh_tokens WHERE token_hash = ?`)
      .get('rt-current') as { replaced_by: string | null };
    expect(current.replaced_by).toBeNull();
  });

  it('keeps every token attached to its device', () => {
    const stored = rows<{ token_hash: string; device_id: string }>(
      `SELECT token_hash, device_id FROM refresh_tokens ORDER BY token_hash`
    );
    expect(stored).toEqual([
      { token_hash: 'rt-current', device_id: 'd-iphone' },
      { token_hash: 'rt-ipad', device_id: 'd-ipad' },
      { token_hash: 'rt-replaced', device_id: 'd-iphone' },
    ]);
  });

  it('leaves no broken foreign key anywhere, including the self-reference', () => {
    expect(rows(`PRAGMA foreign_key_check`)).toEqual([]);
    expect(rows(`PRAGMA integrity_check`)).toEqual([{ integrity_check: 'ok' }]);
  });
});
