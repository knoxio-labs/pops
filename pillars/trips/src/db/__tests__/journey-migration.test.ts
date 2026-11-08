import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { expect, it } from 'vitest';
import { z } from 'zod';

import { openTripsDb } from '../index.js';
import * as schema from '../schema.js';
import { createJourneyLeg, listJourneyLegs } from '../services/journey-legs.js';
import { createJourney } from '../services/journeys.js';
import { createPlace, createTrip, createVisit, listVisits } from '../services/records.js';

it('upgrades an existing foundation database without replacing trip, place or visit source records', () => {
  const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  const directory = mkdtempSync(join(scratch, 'journey-upgrade-'));
  const oldMigrations = join(directory, 'migrations');
  mkdirSync(join(oldMigrations, 'meta'), { recursive: true });
  const migrations = fileURLToPath(new URL('../../../migrations/', import.meta.url));
  copyFileSync(join(migrations, '0000_trips_init.sql'), join(oldMigrations, '0000_trips_init.sql'));
  const journal: unknown = JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8'));
  const parsed = z
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
    .parse(journal);
  writeFileSync(
    join(oldMigrations, 'meta/_journal.json'),
    JSON.stringify({ ...parsed, entries: parsed.entries.slice(0, 1) })
  );
  const path = join(directory, 'trips.db');
  const raw = new Database(path);
  try {
    const db = drizzle(raw, { schema });
    migrate(db, { migrationsFolder: oldMigrations });
    const trip = createTrip(db, { notes: 'original trip' });
    const place = createPlace(db, { name: 'Original place' });
    const visit = createVisit(db, trip.id, {
      placeId: place.id,
      timing: { month: { year: 2028, month: 1 } },
    });
    raw.close();
    const upgraded = openTripsDb(path);
    try {
      expect(listVisits(upgraded.db, trip.id)).toEqual([visit]);
      const journey = createJourney(upgraded.db, trip.id, {});
      const leg = createJourneyLeg(upgraded.db, trip.id, journey.id, {
        from: { placeId: place.id },
      });
      expect(listJourneyLegs(upgraded.db, trip.id, journey.id)).toEqual([leg]);
    } finally {
      upgraded.raw.close();
    }
  } finally {
    if (raw.open) raw.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
