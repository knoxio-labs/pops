/**
 * Containers CRUD + lifecycle service.
 *
 * A container's location is never stored as a single column: `open` and
 * `sealed` containers sit at `originLocationId`; once `moveContainer` runs
 * they sit at `destinationLocationId`. `getContainerCurrentLocationId`
 * is the one place that reads the state to decide which — every other
 * function (and every contained item's `home_inventory.locationId`) stays
 * correct by construction as long as it goes through `moveContainer`.
 *
 * Each function takes an `InventoryDb` handle as its first argument, same
 * convention as `locations.ts`. Read helpers live in
 * `containers-queries.ts` for the same reason they do there.
 */
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import {
  ContainerDestinationLocationNotFoundError,
  ContainerNotFoundError,
  ContainerOriginLocationNotFoundError,
} from '../errors.js';
import { containers, homeInventory, locations } from '../schema.js';
import {
  findContainer,
  getContainerItems,
  getContainerOrThrow,
  getContainersList,
  type ContainerItemsResult,
  type ListContainersOptions,
} from './containers-queries.js';

import type { ContainerRow } from '../row-types.js';
import type { InventoryDb } from './internal.js';

export type { ContainerRow };

export { findContainer, getContainerItems, getContainerOrThrow, getContainersList };
export type { ContainerItemsResult, ListContainersOptions };

/** The box lifecycle. See `CONTAINER_STATES` in `../schema/containers.js`. */
export type ContainerState = 'open' | 'sealed' | 'moved' | 'unpacked';

/** Public API shape for a container. */
export interface Container {
  id: string;
  label: string;
  code: string | null;
  state: ContainerState;
  originLocationId: string | null;
  destinationLocationId: string | null;
  /** Where the container is right now — see {@link getContainerCurrentLocationId}. */
  currentLocationId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Where a container sits right now: its destination once it has moved,
 * otherwise its origin. The single source of truth every read (and the
 * bulk item write in {@link moveContainer}) derives from.
 */
export function getContainerCurrentLocationId(
  row: Pick<ContainerRow, 'originLocationId' | 'destinationLocationId'>
): string | null {
  return row.destinationLocationId ?? row.originLocationId;
}

/** Map a database row to the public API shape. */
export function toContainer(row: ContainerRow): Container {
  return {
    id: row.id,
    label: row.label,
    code: row.code,
    state: row.state as ContainerState,
    originLocationId: row.originLocationId,
    destinationLocationId: row.destinationLocationId,
    currentLocationId: getContainerCurrentLocationId(row),
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface ContainerListResult {
  rows: ContainerRow[];
  total: number;
}

export function listContainers(
  db: InventoryDb,
  opts: ListContainersOptions = {}
): ContainerListResult {
  const rows = getContainersList(db, opts);
  return { rows, total: rows.length };
}

export function getContainer(db: InventoryDb, id: string): ContainerRow {
  return getContainerOrThrow(db, id);
}

function assertLocationExists(db: InventoryDb, id: string, makeError: (id: string) => Error): void {
  const row = db.select({ id: locations.id }).from(locations).where(eq(locations.id, id)).get();
  if (!row) throw makeError(id);
}

function assertOriginExists(db: InventoryDb, id: string): void {
  assertLocationExists(
    db,
    id,
    (locationId) => new ContainerOriginLocationNotFoundError(locationId)
  );
}

function assertDestinationExists(db: InventoryDb, id: string): void {
  assertLocationExists(
    db,
    id,
    (locationId) => new ContainerDestinationLocationNotFoundError(locationId)
  );
}

export interface CreateContainerInput {
  label: string;
  code?: string | null;
  originLocationId?: string | null;
  notes?: string | null;
}

export function createContainer(db: InventoryDb, input: CreateContainerInput): ContainerRow {
  if (input.originLocationId !== undefined && input.originLocationId !== null) {
    assertOriginExists(db, input.originLocationId);
  }

  const id = randomUUID();

  db.insert(containers)
    .values({
      id,
      label: input.label,
      code: input.code ?? null,
      state: 'open',
      originLocationId: input.originLocationId ?? null,
      notes: input.notes ?? null,
    })
    .run();

  return getContainer(db, id);
}

export interface UpdateContainerInput {
  label?: string;
  code?: string | null;
  originLocationId?: string | null;
  notes?: string | null;
}

function buildContainerUpdates(input: UpdateContainerInput): Partial<ContainerRow> {
  const updates: Partial<ContainerRow> = {};
  if (input.label !== undefined) updates.label = input.label;
  if (input.code !== undefined) updates.code = input.code;
  if (input.originLocationId !== undefined) updates.originLocationId = input.originLocationId;
  if (input.notes !== undefined) updates.notes = input.notes;
  return updates;
}

export function updateContainer(
  db: InventoryDb,
  id: string,
  input: UpdateContainerInput
): ContainerRow {
  getContainer(db, id);

  if (input.originLocationId !== undefined && input.originLocationId !== null) {
    assertOriginExists(db, input.originLocationId);
  }

  const updates = buildContainerUpdates(input);
  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date().toISOString();
    db.update(containers).set(updates).where(eq(containers.id, id)).run();
  }

  return getContainer(db, id);
}

function transitionState(db: InventoryDb, id: string, state: ContainerState): ContainerRow {
  getContainer(db, id);
  db.update(containers)
    .set({ state, updatedAt: new Date().toISOString() })
    .where(eq(containers.id, id))
    .run();
  return getContainer(db, id);
}

export function sealContainer(db: InventoryDb, id: string): ContainerRow {
  return transitionState(db, id, 'sealed');
}

export function unpackContainer(db: InventoryDb, id: string): ContainerRow {
  return transitionState(db, id, 'unpacked');
}

/**
 * Move a container to a new location.
 *
 * Exactly two writes happen here, never N: one to the container's own row
 * (state -> 'moved', destination set), one bulk `UPDATE ... WHERE
 * container_id = ?` that relocates every contained item in a single
 * statement. Looping per item would make this O(items in the box); this
 * is O(1) regardless of how full it is.
 */
export function moveContainer(
  db: InventoryDb,
  id: string,
  destinationLocationId: string
): ContainerRow {
  getContainer(db, id);
  assertDestinationExists(db, destinationLocationId);

  const now = new Date().toISOString();

  db.update(containers)
    .set({ state: 'moved', destinationLocationId, updatedAt: now })
    .where(eq(containers.id, id))
    .run();

  db.update(homeInventory)
    .set({ locationId: destinationLocationId, updatedAt: now })
    .where(eq(homeInventory.containerId, id))
    .run();

  return getContainer(db, id);
}

export function deleteContainer(db: InventoryDb, id: string): void {
  getContainer(db, id);
  const result = db.delete(containers).where(eq(containers.id, id)).run();
  if (result.changes === 0) throw new ContainerNotFoundError(id);
}
