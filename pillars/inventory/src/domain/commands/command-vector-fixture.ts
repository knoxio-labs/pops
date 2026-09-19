/**
 * The seed shapes and database writer `command-vectors.ts` uses to bring a
 * fresh migrated database to the state a vector case starts from. Split out
 * so `command-vectors.ts` stays a short orchestrator and `command-vector-cases.ts`
 * a plain data file.
 */
import { sql } from 'drizzle-orm';

import { items, locations, type InventoryDb } from '../../db/index.js';

import type { Mutation } from './envelope.js';

/** The clock every vector is generated at, and every mutation's `clientTime`. */
export const VECTOR_CLOCK = '2026-09-19T00:00:00.000Z';

/** A location the case seeds before running its mutation. */
export interface SeedLocation {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string | null;
}

/** An item the case seeds before running its mutation, at revision 1. */
export interface SeedItem {
  readonly id: string;
  readonly name: string;
  readonly placement:
    | { readonly kind: 'location'; readonly locationId: string }
    | { readonly kind: 'container'; readonly itemId: string }
    | { readonly kind: 'hand' };
  readonly isContainer?: boolean;
  readonly access?: 'open' | 'closed';
  readonly quantity?: number;
  readonly code?: string | null;
  readonly typeKey?: string | null;
  readonly fields?: Record<string, unknown>;
  readonly deletedAt?: string | null;
}

/** One op fixture: what it seeds, mutations run first to build real history, and the mutation the vector records. */
export interface CommandVectorCase {
  readonly name: string;
  readonly op: string;
  readonly seedLocations?: readonly SeedLocation[];
  readonly seedItems?: readonly SeedItem[];
  readonly seedMedia?: readonly string[];
  /** Run before the recorded mutation, to leave real events behind (e.g. an event for `event.revert` to undo). Their outcomes are not recorded. */
  readonly pre?: readonly Omit<Mutation, 'clientTime'>[];
  readonly mutation: Omit<Mutation, 'clientTime'>;
}

function seedLocations(db: InventoryDb, seeds: readonly SeedLocation[]): void {
  for (const location of seeds) {
    db.insert(locations)
      .values({
        id: location.id,
        name: location.name,
        parentId: location.parentId ?? null,
        lastEditedTime: VECTOR_CLOCK,
      })
      .run();
  }
}

function seedItems(db: InventoryDb, seeds: readonly SeedItem[]): void {
  for (const item of seeds) {
    db.insert(items)
      .values({
        id: item.id,
        name: item.name,
        placementKind: item.placement.kind,
        locationId: item.placement.kind === 'location' ? item.placement.locationId : null,
        containingItemId: item.placement.kind === 'container' ? item.placement.itemId : null,
        isContainer: item.isContainer ? 1 : 0,
        access: item.isContainer ? (item.access ?? 'open') : null,
        quantity: item.quantity ?? 1,
        code: item.code ?? null,
        typeKey: item.typeKey ?? null,
        fields: JSON.stringify(item.fields ?? {}),
        deletedAt: item.deletedAt ?? null,
        lastEditedTime: VECTOR_CLOCK,
        seq: 0,
      })
      .run();
  }
}

function seedMedia(db: InventoryDb, hashes: readonly string[]): void {
  for (const sha256 of hashes) {
    db.run(sql`
      insert into media (sha256, mime, byte_size, stored_at)
      values (${sha256}, 'image/jpeg', 100, ${VECTOR_CLOCK})
    `);
  }
}

/** Bring `db` to the state `vectorCase` starts from: its locations, items and media rows. */
export function seedFixture(db: InventoryDb, vectorCase: CommandVectorCase): void {
  seedLocations(db, vectorCase.seedLocations ?? []);
  seedItems(db, vectorCase.seedItems ?? []);
  seedMedia(db, vectorCase.seedMedia ?? []);
}
