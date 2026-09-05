/**
 * The `home_inventory.condition` default has to agree in three places, and
 * nothing else checks that it does.
 *
 * drizzle applies a static `.default(value)` client-side rather than emitting
 * SQLite's `DEFAULT` keyword, so the schema's default is what a create
 * actually stores and the migration's `DEFAULT` clause is only reached by a
 * writer that is not drizzle. That makes them free to drift silently, which
 * they did: the baseline shipped `DEFAULT 'good'` while `INVENTORY_CONDITIONS`
 * documents the column as title-case and the item edit form builds its
 * `<select>` options from that list, so an item created without a condition
 * would have matched none of them (POPS-3020).
 *
 * `check-pillar-schema-coverage` compares tables and indexes, not column
 * defaults, so it cannot see this.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { INVENTORY_CONDITIONS } from '../../contract/types/condition.js';
import { openInventoryDb } from '../open-inventory-db.js';
import { homeInventory } from '../schema.js';

interface ColumnInfo {
  name: string;
  dflt_value: string | null;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-condition-default-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function migratedConditionDefault(): string | null {
  const { raw } = openInventoryDb(join(tmpDir, 'inventory.db'));
  try {
    const columns = raw.pragma('table_info(home_inventory)') as ColumnInfo[];
    return columns.find((column) => column.name === 'condition')?.dflt_value ?? null;
  } finally {
    raw.close();
  }
}

describe('home_inventory.condition default', () => {
  it('is a value the edit form can preselect', () => {
    expect(INVENTORY_CONDITIONS).toContain(homeInventory.condition.default);
  });

  it('agrees between the drizzle schema and the migrated database', () => {
    expect(migratedConditionDefault()).toBe(`'${String(homeInventory.condition.default)}'`);
  });
});
