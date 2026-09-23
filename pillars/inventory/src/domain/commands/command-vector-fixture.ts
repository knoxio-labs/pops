/**
 * The seed shapes and database writer `command-vectors.ts` uses to bring a
 * fresh migrated database to the state a vector case starts from. Split out
 * so `command-vectors.ts` stays a short orchestrator and `command-vector-cases.ts`
 * a plain data file.
 */
import { sql } from 'drizzle-orm';

import { createCatalogueDraft, publishCatalogueDraft } from '../../catalogue/authoring.js';
import { replaceItemFieldValues, resolveProtocol1Type } from '../../catalogue/index.js';
import { itemTypeFields, items, locations, type InventoryDb } from '../../db/index.js';

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
  readonly seedComputedOverrides?: true;
  /** Run before the recorded mutation, to leave real events behind (e.g. an event for `event.revert` to undo). Their outcomes are not recorded. */
  readonly pre?: readonly Omit<Mutation, 'clientTime'>[];
  readonly mutation: Omit<Mutation, 'clientTime'>;
}

const VECTOR_AUTHOR = { kind: 'web', id: 'vector-fixture', label: 'Fixture' } as const;

function seedComputedOverrides(db: InventoryDb): void {
  const draft = createCatalogueDraft(db, 1, VECTOR_AUTHOR);
  db.insert(itemTypeFields)
    .values({
      revision: draft.revision.revision,
      id: '40000000-0000-4000-8000-000000000001',
      typeId: '59538480-6e82-5ccc-b7be-f1cfd15b9af6',
      key: 'Computed vector',
      label: 'Computed vector',
      help: null,
      sortOrder: 6,
      kind: 'boolean',
      cardinality: 'one',
      required: 0,
      storage: 'computed',
      fixedUnit: null,
      referenceKindsJson: '[]',
      referenceTypeIdsJson: '[]',
      expressionVersion: 1,
      expressionJson: JSON.stringify({ op: 'literal', value: true }),
      allowOverride: 1,
      presentationJson: '{}',
      archivedAt: null,
    })
    .run();
  publishCatalogueDraft(
    db,
    draft.revision.revision,
    {
      baseRevision: 1,
      note: null,
      migration: {
        name: 'add-computed-vector',
        fromRevision: 1,
        toRevision: draft.revision.revision,
        affectedTypeIds: ['59538480-6e82-5ccc-b7be-f1cfd15b9af6'],
        affectedFieldIds: ['40000000-0000-4000-8000-000000000001'],
        steps: [],
      },
    },
    VECTOR_AUTHOR
  );
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

function vectorPlacement(item: SeedItem): {
  locationId: string | null;
  containingItemId: string | null;
} {
  if (item.placement.kind === 'location') {
    return { locationId: item.placement.locationId, containingItemId: null };
  }
  if (item.placement.kind === 'container') {
    return { locationId: null, containingItemId: item.placement.itemId };
  }
  return { locationId: null, containingItemId: null };
}

function seedItem(db: InventoryDb, item: SeedItem): void {
  const type = item.typeKey ? resolveProtocol1Type(db, item.typeKey) : null;
  db.insert(items)
    .values({
      id: item.id,
      name: item.name,
      placementKind: item.placement.kind,
      ...vectorPlacement(item),
      isContainer: item.isContainer ? 1 : 0,
      access: item.isContainer ? (item.access ?? 'open') : null,
      quantity: item.quantity ?? 1,
      code: item.code ?? null,
      typeId: type?.id ?? null,
      deletedAt: item.deletedAt ?? null,
      lastEditedTime: VECTOR_CLOCK,
      seq: 0,
    })
    .run();
  if (!type) return;
  replaceItemFieldValues(db, {
    itemId: item.id,
    typeId: type.id,
    fields: item.fields ?? {},
    catalogueRevision: type.revision,
    now: VECTOR_CLOCK,
  });
}

function seedItems(db: InventoryDb, seeds: readonly SeedItem[]): void {
  for (const item of seeds) seedItem(db, item);
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
  if (vectorCase.seedComputedOverrides) seedComputedOverrides(db);
  seedLocations(db, vectorCase.seedLocations ?? []);
  seedItems(db, vectorCase.seedItems ?? []);
  seedMedia(db, vectorCase.seedMedia ?? []);
}
