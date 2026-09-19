import { itemSetAccess, itemSetFull } from './access.js';
import { itemSetCode } from './item-code.js';
import { itemCreate } from './item-create.js';
import { itemEdit } from './item-edit.js';
import { itemAttachPhoto, itemRemovePhoto, itemReorderPhotos } from './item-photos.js';
import { itemSetQuantity } from './item-quantity.js';
import { itemSplit } from './item-split.js';
import { itemChangeType } from './item-type.js';
import { itemRestoreDeleted, itemSetLifecycle } from './lifecycle.js';
import { locationCreate, locationDelete, locationMove, locationRename } from './location.js';
import { itemMove } from './placement.js';
import { eventRevert } from './revert.js';

import type { RegisteredOp } from './op.js';

/** Ops by name: the engine's only dispatch table. */
export type OpRegistry = ReadonlyMap<string, RegisteredOp>;

/** Build a registry, refusing two ops under one name. */
export function buildRegistry(ops: readonly RegisteredOp[]): OpRegistry {
  const registry = new Map<string, RegisteredOp>();
  for (const op of ops) {
    if (registry.has(op.op)) throw new Error(`op ${op.op} is registered twice`);
    registry.set(op.op, op);
  }
  return registry;
}

/** Every op the inventory pillar accepts. A new op is added here and nowhere else in the engine. */
export const COMMAND_REGISTRY: OpRegistry = buildRegistry([
  itemMove,
  itemSetAccess,
  itemSetFull,
  itemSetLifecycle,
  itemRestoreDeleted,
  eventRevert,
  itemCreate,
  itemEdit,
  itemChangeType,
  itemSetCode,
  itemSetQuantity,
  itemSplit,
  itemAttachPhoto,
  itemRemovePhoto,
  itemReorderPhotos,
  locationCreate,
  locationRename,
  locationMove,
  locationDelete,
]);
