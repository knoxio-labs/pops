import { eq } from 'drizzle-orm';

import {
  items,
  locations,
  type ItemInsert,
  type ItemRow,
  type LocationInsert,
  type LocationRow,
} from '../../db/index.js';
import { CommandRejected } from './errors.js';
import { ITEM_FIELD_CODECS } from './item-fields.js';
import { LOCATION_FIELD_CODECS } from './location-fields.js';

import type { RunResult } from 'better-sqlite3';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { JsonValue } from './outcome.js';

/** A synchronous drizzle handle: the database or a transaction (or savepoint) on it. */
export type CommandDb = BaseSQLiteDatabase<'sync', RunResult, Record<string, unknown>>;

/** The revisioned entities a mutation can address. */
export type EntityKind = 'item' | 'location';

/** Wire field name to value, in the order an op produced them. */
export type FieldValues = Record<string, JsonValue>;

/** A revisioned row as the engine and the ops see it. */
export type LoadedEntity =
  | { readonly kind: 'item'; readonly row: ItemRow }
  | { readonly kind: 'location'; readonly row: LocationRow };

/** Load the entity `id` of `kind`, or `null` when no such row exists (tombstones included). */
export function loadEntity(db: CommandDb, kind: EntityKind, id: string): LoadedEntity | null {
  if (kind === 'item') {
    const row = db.select().from(items).where(eq(items.id, id)).get();
    return row ? { kind, row } : null;
  }
  const row = db.select().from(locations).where(eq(locations.id, id)).get();
  return row ? { kind, row } : null;
}

/** The item row of an op's target; an op declared on items only ever receives one. */
export function requireItem(target: LoadedEntity): ItemRow {
  if (target.kind !== 'item') throw new CommandRejected('invalid', 'this op applies to items only');
  return target.row;
}

/** The location row of an op's target; an op declared on locations only ever receives one. */
export function requireLocation(target: LoadedEntity): LocationRow {
  if (target.kind !== 'location') {
    throw new CommandRejected('invalid', 'this op applies to locations only');
  }
  return target.row;
}

/** Whether `field` is a wire field the command layer can write on `kind`. */
export function isWritableField(kind: EntityKind, field: string): boolean {
  const codecs = kind === 'item' ? ITEM_FIELD_CODECS : LOCATION_FIELD_CODECS;
  return Object.hasOwn(codecs, field);
}

/** The current wire value of `field` on a loaded entity. */
export function currentValue(entity: LoadedEntity, field: string): JsonValue {
  if (entity.kind === 'item') {
    const codec = ITEM_FIELD_CODECS[field];
    if (!codec) throw new CommandRejected('invalid', `item has no writable field ${field}`);
    return codec.read(entity.row);
  }
  const codec = LOCATION_FIELD_CODECS[field];
  if (!codec) throw new CommandRejected('invalid', `location has no writable field ${field}`);
  return codec.read(entity.row);
}

/** What a write stamps on the row besides the changed fields. */
export interface WriteStamp {
  readonly revision: number;
  readonly seq: number;
  readonly now: string;
}

function itemColumns(changes: FieldValues, now: string): Partial<ItemInsert> {
  const columns: Partial<ItemInsert> = {};
  for (const [field, value] of Object.entries(changes)) {
    const codec = ITEM_FIELD_CODECS[field];
    if (!codec) throw new CommandRejected('invalid', `item has no writable field ${field}`);
    Object.assign(columns, codec.columns(value, now));
  }
  return columns;
}

function locationColumns(changes: FieldValues, now: string): Partial<LocationInsert> {
  const columns: Partial<LocationInsert> = {};
  for (const [field, value] of Object.entries(changes)) {
    const codec = LOCATION_FIELD_CODECS[field];
    if (!codec) throw new CommandRejected('invalid', `location has no writable field ${field}`);
    Object.assign(columns, codec.columns(value, now));
  }
  return columns;
}

/**
 * Write `changes` onto an existing row in one UPDATE, with its new revision,
 * the `seq` of the event that records the change, and the server time.
 */
export function writeEntity(
  db: CommandDb,
  entity: LoadedEntity,
  changes: FieldValues,
  stamp: WriteStamp
): void {
  const common = { revision: stamp.revision, seq: stamp.seq, updatedAt: stamp.now };
  if (entity.kind === 'item') {
    db.update(items)
      .set({ ...itemColumns(changes, stamp.now), ...common, lastEditedTime: stamp.now })
      .where(eq(items.id, entity.row.id))
      .run();
    return;
  }
  db.update(locations)
    .set({ ...locationColumns(changes, stamp.now), ...common, lastEditedTime: stamp.now })
    .where(eq(locations.id, entity.row.id))
    .run();
}
