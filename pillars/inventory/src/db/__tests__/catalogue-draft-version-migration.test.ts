import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { registerPersistedItemTypesMigrationFunctions } from '../migrations/persisted-item-types-bootstrap.js';
import { openInventoryDb } from '../open-inventory-db.js';
import { MIGRATIONS_DIR } from './migrated-db.js';

import type { OpenedInventoryDb } from '../open-inventory-db.js';

const BASELINE_TAG = '0017_persisted_item_types';

let directory: string;
let opened: OpenedInventoryDb;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'inventory-draft-version-migration-'));
  const databasePath = join(directory, 'inventory.db');
  const staged = stageMigrationsThrough({
    migrationsFolder: MIGRATIONS_DIR,
    through: BASELINE_TAG,
    targetFolder: join(directory, 'staged-migrations'),
  });
  const raw = new Database(databasePath);
  raw.pragma('foreign_keys = ON');
  registerPersistedItemTypesMigrationFunctions(raw);
  migrate(drizzle(raw), { migrationsFolder: staged });
  raw
    .prepare(
      `INSERT INTO catalogue_revisions
         (base_revision, status, minimum_protocol, created_actor_kind, created_actor_id,
          created_actor_label, created_at)
       VALUES (1, 'draft', 2, 'web', 'owner', 'Owner', '2026-09-22T00:00:00Z')`
    )
    .run();
  raw.close();
  opened = openInventoryDb(databasePath);
});

afterEach(() => {
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('0018_catalogue_draft_version', () => {
  it('backfills every existing revision, including an in-progress draft, to version 1', () => {
    const rows = opened.raw
      .prepare('SELECT revision, status, draft_version FROM catalogue_revisions ORDER BY revision')
      .all();

    expect(rows).toEqual([
      { revision: 1, status: 'published', draft_version: 1 },
      { revision: 2, status: 'draft', draft_version: 1 },
    ]);
  });

  it('refuses a draft version below 1', () => {
    expect(() =>
      opened.raw
        .prepare('UPDATE catalogue_revisions SET draft_version = 0 WHERE revision = 2')
        .run()
    ).toThrow(/ck_catalogue_revisions_draft_version/);
  });

  it('keeps a published revision immutable, including its draft version', () => {
    expect(() =>
      opened.raw
        .prepare('UPDATE catalogue_revisions SET draft_version = 2 WHERE revision = 1')
        .run()
    ).toThrow(/terminal catalogue revision is immutable/);
  });
});
