import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { expect, it } from 'vitest';
import { z } from 'zod';

import { openTripsDb } from '../index.js';
import { getDecisionOption } from '../services/decision-queries.js';
import { restoreDecisionOption, updateDecisionOption } from '../services/decisions.js';

it('backfills live and tombstoned accepted memberships and retains their provenance after unlink and reopening SQLite', () => {
  const root = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'decision-history-upgrade-'));
  const migrations = fileURLToPath(new URL('../../../migrations/', import.meta.url));
  const previous = join(directory, 'migrations');
  mkdirSync(join(previous, 'meta'), { recursive: true });
  const journal = z
    .object({
      version: z.string(),
      dialect: z.string(),
      entries: z.array(
        z.object({
          idx: z.number(),
          version: z.string(),
          when: z.number(),
          tag: z.string(),
          breakpoints: z.boolean(),
        })
      ),
    })
    .parse(JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8')));
  const index = journal.entries.findIndex((entry) =>
    entry.tag.endsWith('_decision_source_provenance')
  );
  expect(index).toBeGreaterThan(0);
  const entries = journal.entries.slice(0, index);
  for (const entry of entries)
    copyFileSync(join(migrations, `${entry.tag}.sql`), join(previous, `${entry.tag}.sql`));
  writeFileSync(join(previous, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
  const path = join(directory, 'trips.db');
  const raw = new Database(path);
  const timestamp = '2030-01-01T00:00:00.000Z';
  const affectedSources = [{ kind: 'journey' as const, id: 1 }];
  try {
    migrate(drizzle(raw), { migrationsFolder: previous });
    raw
      .prepare('INSERT INTO trips (id, created_at, updated_at) VALUES (?, ?, ?)')
      .run(1, timestamp, timestamp);
    raw
      .prepare(
        'INSERT INTO decisions (id, trip_id, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(1, 1, 2, timestamp, timestamp);
    const insert = raw.prepare(
      'INSERT INTO decision_options (id, decision_id, affected_sources, removed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insert.run(1, 1, JSON.stringify(affectedSources), null, timestamp, timestamp);
    insert.run(2, 1, JSON.stringify(affectedSources), timestamp, timestamp, timestamp);
    raw.close();
    const upgraded = openTripsDb(path);
    try {
      updateDecisionOption(
        upgraded.db,
        { tripId: 1, decisionId: 1, id: 1 },
        { affectedSources: [] },
        2
      );
      expect(
        updateDecisionOption(
          upgraded.db,
          { tripId: 1, decisionId: 1, id: 1 },
          { affectedSources },
          3
        ).affectedSources
      ).toEqual(affectedSources);
      expect(
        restoreDecisionOption(upgraded.db, { tripId: 1, decisionId: 1, id: 2 }, 4, false)
          .affectedSources
      ).toEqual(affectedSources);
      updateDecisionOption(
        upgraded.db,
        { tripId: 1, decisionId: 1, id: 1 },
        { affectedSources: [] },
        5
      );
    } finally {
      upgraded.raw.close();
    }
    const reopened = openTripsDb(path);
    try {
      expect(
        updateDecisionOption(
          reopened.db,
          { tripId: 1, decisionId: 1, id: 1 },
          { affectedSources },
          6
        ).affectedSources
      ).toEqual(affectedSources);
      expect(getDecisionOption(reopened.db, 1, 1, 1)).not.toHaveProperty('validatedSources');
    } finally {
      reopened.raw.close();
    }
  } finally {
    if (raw.open) raw.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
