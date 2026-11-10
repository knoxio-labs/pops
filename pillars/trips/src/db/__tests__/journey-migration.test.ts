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
import { createJourneyGroup } from '../services/journey-groups.js';
import { createJourneyLeg, listJourneyLegs } from '../services/journey-legs.js';
import { createJourney, getJourney } from '../services/journeys.js';
import { getJourneyLegSet } from '../services/leg-set.js';
import { createPlace, getTrip, getVisit, listVisits } from '../services/records.js';
import { createStay, getStay } from '../services/stays.js';

function seedLegacyJourney(
  raw: Database.Database,
  tripId: number,
  placeId: number,
  timestamp: string
) {
  const journeyId = Number(
    raw
      .prepare(
        'INSERT INTO journeys (trip_id, reference, source_links, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        tripId,
        'Existing source',
        JSON.stringify([{ uri: 'pops:documents/document/42' }]),
        timestamp,
        timestamp
      ).lastInsertRowid
  );
  const legId = Number(
    raw
      .prepare(
        'INSERT INTO journey_legs (journey_id, position, from_endpoint, purchase, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(journeyId, 0, JSON.stringify({ placeId }), 'Purchased', timestamp, timestamp)
      .lastInsertRowid
  );
  return {
    journeyId,
    legId,
    journey: z
      .record(z.string(), z.unknown())
      .parse(raw.prepare('SELECT * FROM journeys WHERE id = ?').get(journeyId)),
    leg: z
      .record(z.string(), z.unknown())
      .parse(raw.prepare('SELECT * FROM journey_legs WHERE id = ?').get(legId)),
  };
}

it.each([1, 2, 3, 4])(
  'upgrades a database with %i source migrations without replacing existing records',
  (migrationCount) => {
    const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
    mkdirSync(scratch, { recursive: true });
    const directory = mkdtempSync(join(scratch, 'journey-upgrade-'));
    const oldMigrations = join(directory, 'migrations');
    mkdirSync(join(oldMigrations, 'meta'), { recursive: true });
    const migrations = fileURLToPath(new URL('../../../migrations/', import.meta.url));
    const migrationFiles = [
      '0000_trips_init.sql',
      '0001_journey_sources.sql',
      '0002_journey_alternatives.sql',
      '0003_stay_sources.sql',
    ];
    for (const file of migrationFiles.slice(0, migrationCount))
      copyFileSync(join(migrations, file), join(oldMigrations, file));
    const journal: unknown = JSON.parse(
      readFileSync(join(migrations, 'meta/_journal.json'), 'utf8')
    );
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
      JSON.stringify({ ...parsed, entries: parsed.entries.slice(0, migrationCount) })
    );
    const path = join(directory, 'trips.db');
    const raw = new Database(path);
    try {
      const db = drizzle(raw, { schema });
      migrate(db, { migrationsFolder: oldMigrations });
      const timestamp = '2028-01-01T00:00:00.000Z';
      const trip = {
        id: Number(
          raw
            .prepare('INSERT INTO trips (notes, created_at, updated_at) VALUES (?, ?, ?)')
            .run('original trip', timestamp, timestamp).lastInsertRowid
        ),
      };
      const place = createPlace(db, { name: 'Original place' });
      const visitId = Number(
        raw
          .prepare(
            'INSERT INTO visits (trip_id, place_id, position, timing, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(
            trip.id,
            place.id,
            0,
            JSON.stringify({ month: { year: 2028, month: 1 } }),
            timestamp,
            timestamp
          ).lastInsertRowid
      );
      const visit = getVisit(db, trip.id, visitId);
      const previous =
        migrationCount >= 2 ? seedLegacyJourney(raw, trip.id, place.id, timestamp) : undefined;
      raw.close();
      const upgraded = openTripsDb(path);
      try {
        expect(getTrip(upgraded.db, trip.id)).toMatchObject({
          notes: 'original trip',
          destination: '',
          when: '',
          parentId: null,
          tagId: null,
          name: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        expect(listVisits(upgraded.db, trip.id)).toEqual([visit]);
        if (previous) {
          expect(getJourney(upgraded.db, trip.id, previous.journeyId)).toMatchObject({
            id: previous.journeyId,
            reference: 'Existing source',
          });
          expect(listJourneyLegs(upgraded.db, trip.id, previous.journeyId)).toMatchObject([
            { id: previous.legId, from: { placeId: place.id }, purchase: 'Purchased' },
          ]);
          expect(
            upgraded.raw.prepare('SELECT * FROM journeys WHERE id = ?').get(previous.journeyId)
          ).toMatchObject(previous.journey);
          expect(
            upgraded.raw.prepare('SELECT * FROM journey_legs WHERE id = ?').get(previous.legId)
          ).toMatchObject(previous.leg);
          expect(getJourneyLegSet(upgraded.db, trip.id, previous.journeyId).revision).toBe(0);
        }
        const stay = createStay(upgraded.db, trip.id, {
          visitId: visit.id,
          timing: { departure: '2028-01-01' },
          status: 'Reserved',
        });
        expect(getStay(upgraded.db, trip.id, stay.id)).toEqual(stay);
        const journey = createJourney(upgraded.db, trip.id, {});
        const leg = createJourneyLeg(upgraded.db, trip.id, journey.id, {
          from: { placeId: place.id },
        });
        expect(listJourneyLegs(upgraded.db, trip.id, journey.id)).toEqual([leg]);
        expect(
          createJourneyGroup(upgraded.db, trip.id, { currentJourneyId: journey.id })
        ).toMatchObject({ currentJourneyId: journey.id, alternativeJourneyIds: [], revision: 0 });
      } finally {
        upgraded.raw.close();
      }
    } finally {
      if (raw.open) raw.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }
);
