import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { expect, it } from 'vitest';

import { openTripsDb } from '../index.js';
import * as schema from '../schema.js';
import { getPlace } from '../services/records.js';
import { migrationsBefore } from './migration-test-utils.js';

it('adds an unselected pin to existing place records without changing source facts', () => {
  const root = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'place-pin-upgrade-'));
  const path = join(directory, 'trips.db');
  const raw = new Database(path);
  let placeId = 0;
  try {
    const db = drizzle(raw, { schema });
    migrate(db, { migrationsFolder: migrationsBefore(directory, '_regular_victor_mancha') });
    placeId = Number(
      raw
        .prepare(
          'INSERT INTO places (name, source_links, created_at, updated_at) VALUES (?, ?, ?, ?)'
        )
        .run('Recife', '[]', '2028-01-01T00:00:00.000Z', '2028-01-01T00:00:00.000Z').lastInsertRowid
    );
  } finally {
    raw.close();
  }

  const upgraded = openTripsDb(path);
  try {
    expect(getPlace(upgraded.db, placeId)).toMatchObject({
      id: placeId,
      name: 'Recife',
      pin: null,
      sourceLinks: [],
    });
  } finally {
    upgraded.raw.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
