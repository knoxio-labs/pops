/**
 * Migration test for 0099_accounts_entity_id_backfill (POPS-3063).
 *
 * Pins `institutions` and `accounts` exactly as they stand right before 0099
 * runs — `institutions.migrated_entity_id` exists (0098) and
 * `idx_accounts_entity_currency` is still the BLANKET unique index 0085
 * created — same technique `accounts-migration.test.ts` (0083) uses.
 *
 * Covers both halves of the migration: the backfill only touches a row whose
 * institution has actually migrated, leaving an un-migrated institution's
 * accounts (the ANZ POPS-3099 case) untouched; and the index is repointed to
 * a partial index scoped to `kind = 'person'`, so two ordinary accounts that
 * end up sharing an issuer + currency no longer collide.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PRE_MIGRATION_DDL = `
CREATE TABLE institutions (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  colour text NOT NULL,
  logo_asset_id text,
  migrated_entity_id text,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);

CREATE TABLE accounts (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  institution_id text,
  kind text NOT NULL,
  currency text NOT NULL,
  archived_at text,
  display_order integer DEFAULT 0 NOT NULL,
  entity_id text,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
CREATE UNIQUE INDEX idx_accounts_entity_currency ON accounts (entity_id, currency);
`;

function migrationSql(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, '..', '..', '..', 'migrations', '0099_accounts_entity_id_backfill.sql');
  return readFileSync(file, 'utf8')
    .split('--> statement-breakpoint')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

const MIGRATION = migrationSql();

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(PRE_MIGRATION_DDL);
});

afterEach(() => {
  raw.close();
});

function insertInstitution(id: string, name: string, migratedEntityId: string | null): void {
  raw
    .prepare(
      `INSERT INTO institutions (id, name, colour, migrated_entity_id) VALUES (?, ?, '#000000', ?)`
    )
    .run(id, name, migratedEntityId);
}

function insertAccount(
  id: string,
  name: string,
  kind: string,
  currency: string,
  institutionId: string | null,
  entityId: string | null
): void {
  raw
    .prepare(
      `INSERT INTO accounts (id, name, kind, currency, institution_id, entity_id) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, name, kind, currency, institutionId, entityId);
}

function migrate(): void {
  raw.transaction(() => {
    for (const statement of MIGRATION) raw.exec(statement);
  })();
}

function entityIdOf(accountId: string): string | null {
  return (
    raw.prepare('SELECT entity_id FROM accounts WHERE id = ?').get(accountId) as {
      entity_id: string | null;
    }
  ).entity_id;
}

describe('0099 — backfills accounts.entity_id from a migrated institution', () => {
  it('sets entity_id for an account whose institution has migrated', () => {
    insertInstitution('inst-amex', 'Amex', 'entity-amex');
    insertAccount('acc-amex', 'Amex Card', 'credit-card', 'AUD', 'inst-amex', null);

    migrate();

    expect(entityIdOf('acc-amex')).toBe('entity-amex');
  });

  it('leaves entity_id null for an account whose institution has NOT migrated (POPS-3099)', () => {
    insertInstitution('inst-anz', 'ANZ', null);
    insertAccount('acc-anz', 'ANZ Everyday', 'checking', 'AUD', 'inst-anz', null);

    migrate();

    expect(entityIdOf('acc-anz')).toBeNull();
  });

  it('leaves entity_id null for an account with no institution at all', () => {
    insertAccount('acc-cash', 'Wallet', 'cash', 'AUD', null, null);

    migrate();

    expect(entityIdOf('acc-cash')).toBeNull();
  });

  it('never overwrites an entity_id an account already carries', () => {
    insertInstitution('inst-amex', 'Amex', 'entity-amex');
    insertAccount('acc-amex', 'Amex Card', 'credit-card', 'AUD', 'inst-amex', 'entity-already-set');

    migrate();

    expect(entityIdOf('acc-amex')).toBe('entity-already-set');
  });

  it('is idempotent — re-running touches nothing new', () => {
    insertInstitution('inst-amex', 'Amex', 'entity-amex');
    insertAccount('acc-amex', 'Amex Card', 'credit-card', 'AUD', 'inst-amex', null);

    migrate();
    expect(entityIdOf('acc-amex')).toBe('entity-amex');

    migrate();
    expect(entityIdOf('acc-amex')).toBe('entity-amex');
  });
});

describe('0099 — repoints idx_accounts_entity_currency to a partial index', () => {
  it('the OLD blanket unique index rejects two accounts sharing an entity_id and currency', () => {
    // Proves the fix is load-bearing: without repointing the index to a
    // partial one, the backfill below would itself violate it on the second
    // row.
    raw
      .prepare(`INSERT INTO accounts (id, name, kind, currency, entity_id) VALUES
      ('acc-checking', 'Amex Checking', 'checking', 'AUD', 'entity-amex')`)
      .run();
    expect(() =>
      raw
        .prepare(
          `INSERT INTO accounts (id, name, kind, currency, entity_id) VALUES
           ('acc-savings', 'Amex Savings', 'savings', 'AUD', 'entity-amex')`
        )
        .run()
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('allows two non-person accounts to share the same entity_id and currency after the migration', () => {
    insertInstitution('inst-amex', 'Amex', 'entity-amex');
    insertAccount('acc-checking', 'Amex Checking', 'checking', 'AUD', 'inst-amex', null);
    insertAccount('acc-savings', 'Amex Savings', 'savings', 'AUD', 'inst-amex', null);

    migrate();

    expect(entityIdOf('acc-checking')).toBe('entity-amex');
    expect(entityIdOf('acc-savings')).toBe('entity-amex');
  });

  it('still rejects a second person account for the same contact and currency after the migration', () => {
    insertAccount('acc-p1', 'Alice', 'person', 'AUD', null, 'entity-alice');

    migrate();

    expect(() =>
      insertAccount('acc-p2', 'Alice again', 'person', 'AUD', null, 'entity-alice')
    ).toThrow(/UNIQUE constraint failed/);
  });
});
