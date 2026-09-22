/**
 * Shared fixtures for the command-layer suites: a migrated in-memory database,
 * seeded rows written directly (revision 1, no events, as a migrated row with
 * its history elsewhere), mutation builders and actors.
 */
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { loadProtocol1Fields, resolveProtocol1Type } from '../../../catalogue/index.js';
import { openMigratedTestDb } from '../../../db/__tests__/migrated-db.js';
import { events, items, locations, mutations, type ItemRow } from '../../../db/index.js';
import { runMutation } from '../engine.js';

import type Database from 'better-sqlite3';

import type { Protocol1Fields } from '../../../catalogue/index.js';
import type { InventoryDb } from '../../../db/index.js';
import type { EngineOptions } from '../engine.js';
import type { CommandActor, Mutation } from '../envelope.js';
import type { Outcome } from '../outcome.js';

export const PHONE: CommandActor = { kind: 'device', id: 'device-phone', label: 'Phone' };
export const IPAD: CommandActor = { kind: 'device', id: 'device-ipad', label: 'iPad' };
export const WEB: CommandActor = { kind: 'web' };

export interface Harness {
  db: InventoryDb;
  raw: Database.Database;
  run(mutation: Mutation, actor?: CommandActor, options?: EngineOptions): Outcome;
  item(id: string): ItemRow;
  fields(id: string): Protocol1Fields;
  eventsFor(id: string): (typeof events.$inferSelect)[];
  eventCount(): number;
  storedMutation(id: string): typeof mutations.$inferSelect | undefined;
}

let tick = 0;

/** A clock that advances one second per call, so event times are distinct and ordered. */
export function testClock(): string {
  tick += 1;
  return new Date(Date.UTC(2026, 8, 19, 0, 0, tick)).toISOString();
}

export function openHarness(): Harness {
  const { db, raw } = openMigratedTestDb();
  return {
    db,
    raw,
    run: (mutation, actor = PHONE, options = {}) =>
      runMutation(db, mutation, actor, { now: testClock, ...options }),
    item(id) {
      const row = db.select().from(items).where(eq(items.id, id)).get();
      if (!row) throw new Error(`no item ${id}`);
      return row;
    },
    fields: (id) => loadProtocol1Fields(db, id),
    eventsFor: (id) => db.select().from(events).where(eq(events.entityId, id)).all(),
    eventCount: () => db.select().from(events).all().length,
    storedMutation: (id) => db.select().from(mutations).where(eq(mutations.mutationId, id)).get(),
  };
}

export function seedLocation(
  h: Harness,
  id: string,
  extra: { parentId?: string; deletedAt?: string } = {}
): void {
  h.db
    .insert(locations)
    .values({
      id,
      name: id,
      parentId: extra.parentId ?? null,
      lastEditedTime: '2026-09-18T00:00:00.000Z',
      deletedAt: extra.deletedAt ?? null,
    })
    .run();
}

export interface SeedItem {
  id: string;
  locationId?: string;
  containerId?: string;
  isContainer?: boolean;
  access?: 'open' | 'closed';
  lifecycle?: ItemRow['lifecycle'];
  deletedAt?: string;
  quantity?: number;
  code?: string;
  typeKey?: string;
  sourceRef?: string;
}

function seededPlacementKind(seed: SeedItem): ItemRow['placementKind'] {
  if (seed.containerId) return 'container';
  return seed.locationId ? 'location' : 'hand';
}

/** Insert an item at a location, in a container, or (neither given) in hand. */
export function seedItem(h: Harness, seed: SeedItem): void {
  const placementKind = seededPlacementKind(seed);
  h.db
    .insert(items)
    .values({
      id: seed.id,
      name: seed.id,
      placementKind,
      locationId: seed.containerId ? null : (seed.locationId ?? null),
      containingItemId: seed.containerId ?? null,
      isContainer: seed.isContainer ? 1 : 0,
      access: seed.isContainer ? (seed.access ?? 'open') : null,
      lifecycle: seed.lifecycle ?? 'active',
      deletedAt: seed.deletedAt ?? null,
      quantity: seed.quantity ?? 1,
      code: seed.code ?? null,
      typeId: seed.typeKey ? (resolveProtocol1Type(h.db, seed.typeKey)?.id ?? null) : null,
      sourceRef: seed.sourceRef ?? null,
      lastEditedTime: '2026-09-18T00:00:00.000Z',
      seq: 0,
    })
    .run();
}

/** A mutation with a fresh id, the given base revision, and no dependencies. */
export function mutation(
  op: string,
  entityId: string,
  args: unknown,
  extra: Partial<Mutation> = {}
): Mutation {
  return {
    mutationId: randomUUID(),
    op,
    entityId,
    baseRevision: 1,
    dependsOn: [],
    clientTime: '2026-09-18T12:00:00.000Z',
    args,
    ...extra,
  };
}

/** `item.move` to a location. */
export function moveTo(
  itemId: string,
  locationId: string,
  extra: Partial<Mutation> = {}
): Mutation {
  return mutation(
    'item.move',
    itemId,
    { to: { kind: 'location', locationId }, verb: 'move' },
    extra
  );
}
