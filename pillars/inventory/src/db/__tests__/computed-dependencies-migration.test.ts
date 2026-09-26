/**
 * Migration `0019_item_computed_dependencies` creates the reverse-dependency
 * index empty; the boot backfill fills it for items that already exist, and
 * rebuilds it whenever it was built for another catalogue revision.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  publishReferenceComputedTypes,
  type ReferenceComputedCatalogue,
} from '../../catalogue/__tests__/computed-reference-fixture.js';
import { ensureComputedDependencyIndex } from '../../catalogue/computed-dependency-index.js';
import { runMutation } from '../../domain/commands/index.js';
import { openInventoryDb, type OpenedInventoryDb } from '../open-inventory-db.js';

const MIGRATION_WHEN = 1790200000000;
const ACTOR = { kind: 'service', id: 'test' } as const;

let directory: string;
let path: string;
let opened: OpenedInventoryDb;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'inventory-computed-dependencies-'));
  path = join(directory, 'inventory.db');
  opened = openInventoryDb(path);
});

afterEach(() => {
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});

function create(
  catalogue: ReferenceComputedCatalogue,
  typeId: string,
  values: { fieldId: string; values: unknown[] }[]
): string {
  const id = randomUUID();
  const outcome = runMutation(
    opened.db,
    {
      mutationId: randomUUID(),
      op: 'item.create',
      entityId: id,
      baseRevision: null,
      catalogueRevision: catalogue.revision,
      dependsOn: [],
      clientTime: '2026-09-23T00:00:00.000Z',
      args: { item: { name: 'Item', typeId, values } },
    },
    ACTOR
  );
  expect(outcome.status).toBe('applied');
  return id;
}

function seedChain(): { partId: string; kitId: string; bundleId: string } {
  const catalogue = publishReferenceComputedTypes(opened.db);
  const partId = create(catalogue, catalogue.partTypeId, [
    { fieldId: catalogue.weightFieldId, values: [5] },
  ]);
  const kitId = create(catalogue, catalogue.kitTypeId, [
    { fieldId: catalogue.kitPartFieldId, values: [{ targetKind: 'item', targetId: partId }] },
  ]);
  const bundleId = create(catalogue, catalogue.bundleTypeId, [
    { fieldId: catalogue.bundleKitFieldId, values: [{ targetKind: 'item', targetId: kitId }] },
  ]);
  return { partId, kitId, bundleId };
}

function indexRows(): { dependency: string; dependent: string }[] {
  return opened.raw
    .prepare(
      `SELECT dependency_item_id AS dependency, dependent_item_id AS dependent
         FROM item_computed_dependencies ORDER BY dependency, dependent`
    )
    .all() as { dependency: string; dependent: string }[];
}

function builtFor(): unknown {
  return opened.raw.prepare('SELECT catalogue_revision FROM computed_dependency_index_state').get();
}

function expectedRows(chain: ReturnType<typeof seedChain>) {
  return [
    { dependency: chain.kitId, dependent: chain.bundleId },
    { dependency: chain.partId, dependent: chain.bundleId },
    { dependency: chain.partId, dependent: chain.kitId },
  ].toSorted(
    (left, right) =>
      left.dependency.localeCompare(right.dependency) ||
      left.dependent.localeCompare(right.dependent)
  );
}

/** Undoes 0019 and every migration after it, so reopening applies them again. */
function rewindToBeforeMigration(): void {
  opened.raw.exec(`
    DROP TABLE item_computed_dependencies;
    DROP TABLE computed_dependency_index_state;
    DROP TABLE device_sync_ledgers;
    ALTER TABLE item_types DROP COLUMN replaced_by;
    ALTER TABLE item_types DROP COLUMN parent_type_id;
    ALTER TABLE item_type_fields DROP COLUMN replaced_by;
    ALTER TABLE item_type_fields DROP COLUMN default_values_json;
  `);
  const removed = opened.raw
    .prepare('DELETE FROM __drizzle_migrations WHERE created_at >= ?')
    .run(MIGRATION_WHEN);
  expect(removed.changes).toBe(4);
  opened.raw.close();
}

describe('0019_item_computed_dependencies', () => {
  it('backfills the index for items that existed before the migration', () => {
    const chain = seedChain();
    const revision = Number(
      opened.raw
        .prepare("SELECT value FROM sync_meta WHERE key = 'catalogue_revision'")
        .pluck()
        .get()
    );
    expect(revision).toBeGreaterThan(1);
    rewindToBeforeMigration();

    opened = openInventoryDb(path);

    expect(indexRows()).toEqual(expectedRows(chain));
    expect(builtFor()).toEqual({ catalogue_revision: revision });
  });

  it('rebuilds an index built for another catalogue revision, and leaves a current one alone', () => {
    const chain = seedChain();
    opened.raw.exec('DELETE FROM item_computed_dependencies');
    opened.raw.exec('UPDATE computed_dependency_index_state SET catalogue_revision = 1');

    expect(ensureComputedDependencyIndex(opened.db)).toBe(true);
    expect(indexRows()).toEqual(expectedRows(chain));

    opened.raw.exec('DELETE FROM item_computed_dependencies');
    expect(ensureComputedDependencyIndex(opened.db)).toBe(false);
    expect(indexRows()).toEqual([]);
  });

  it('drops a dependent’s rows when the dependent is hard-deleted', () => {
    const chain = seedChain();
    opened.raw.prepare('DELETE FROM items WHERE id = ?').run(chain.bundleId);

    expect(indexRows()).toEqual([{ dependency: chain.partId, dependent: chain.kitId }]);
  });
});
