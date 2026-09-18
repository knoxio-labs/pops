/**
 * The mutating `items.*` handlers (`create`, `update`, `delete`), split out
 * of `items-handlers.ts` to stay under the file line budget. Every write
 * goes through the command engine (POPS-4053), recorded against actor
 * `web`, with the legacy response shape unchanged for purchases' fan-out
 * and the MCP tools.
 */
import { randomUUID } from 'node:crypto';

import { type InventoryDb } from '../../db/index.js';
import { isSourceRefConflict } from '../../db/services/source-ref-conflict.js';
import {
  wirePlacementForCreate,
  wirePlacementForUpdate,
} from '../modules/items/legacy-placement.js';
import * as service from '../modules/items/service.js';
import { toInventoryItem } from '../modules/items/types.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';
import { runLegacyMutation } from './command-bridge.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryItemsContract } from '../../contract/rest-items.js';
import type { Outcome } from '../../domain/commands/index.js';
import type { ItemRow } from '../modules/items/types.js';
import type { LegacyMutationRequest } from './command-bridge.js';

type Req = ServerInferRequest<typeof inventoryItemsContract>;

/** The legacy provenance and value fields a create or update body carries. */
const LEGACY_FIELD_KEYS = [
  'brand',
  'model',
  'itemId',
  'room',
  'type',
  'location',
  'condition',
  'inUse',
  'deductible',
  'purchaseDate',
  'warrantyExpires',
  'replacementValue',
  'resaleValue',
  'purchasePrice',
  'purchaseTransactionId',
  'purchasedFromId',
  'purchasedFromName',
] as const;

type LegacyFieldSource = Partial<Record<(typeof LEGACY_FIELD_KEYS)[number], unknown>>;

/** The subset of `body`'s legacy fields that are actually present, for `item.create`/`item.edit`'s `legacy` patch. */
function pickLegacyFields(body: LegacyFieldSource): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of LEGACY_FIELD_KEYS) {
    if (body[key] !== undefined) picked[key] = body[key];
  }
  return picked;
}

/** The placement reference a mutation named, so a `target_missing`/`not_container` rejection can name it back. */
interface PlacementTarget {
  readonly resource: 'Container' | 'Location';
  readonly id: string;
}

/** The placement reference a legacy create/update body named, for a `target_missing` rejection's message. */
function placementTarget(body: {
  containerId?: string | null;
  locationId?: string | null;
}): PlacementTarget | undefined {
  if (typeof body.containerId === 'string') return { resource: 'Container', id: body.containerId };
  if (typeof body.locationId === 'string') return { resource: 'Location', id: body.locationId };
  return undefined;
}

/**
 * Throw the `HttpError` a legacy `/items` caller expects for a command
 * outcome that did not apply. `target` names the reference a
 * `target_missing`/`not_container` rejection refused; omit it for a
 * rejection that names none (an item edit's own field checks).
 */
function throwForItemOutcome(outcome: Outcome, target?: PlacementTarget): never {
  if (outcome.status === 'rejected') {
    if (outcome.reason === 'target_missing' || outcome.reason === 'not_container') {
      throw new NotFoundError(target?.resource ?? 'Container', target?.id ?? outcome.message);
    }
    if (outcome.reason === 'cycle') {
      throw new ValidationError('An item cannot be placed inside itself or its own contents');
    }
    throw new ValidationError(outcome.message);
  }
  if (outcome.status === 'conflict') {
    if (outcome.kind === 'code_collision') {
      throw new ConflictError(`Asset id already used by ${outcome.heldBy.name}`);
    }
    throw new ConflictError(`conflict: ${outcome.kind}`);
  }
  throw new Error(`unexpected ${outcome.status} outcome for a synchronous legacy mutation`);
}

/** A legacy item mutation, plus the placement reference to name if it is refused. */
interface ItemMutationRequest extends LegacyMutationRequest {
  readonly target?: PlacementTarget;
}

/** Run a legacy item mutation, throwing the mapped `HttpError` when it did not apply. */
function applyItemMutation(db: InventoryDb, request: ItemMutationRequest): void {
  const outcome = runLegacyMutation(db, request);
  if (outcome.status !== 'applied') throwForItemOutcome(outcome, request.target);
}

function handleCreate(db: InventoryDb, body: Req['create']['body']) {
  const id = randomUUID();
  const placement = wirePlacementForCreate(body);
  const args = {
    item: { name: body.itemName, note: body.notes ?? null, ...(placement ? { placement } : {}) },
    legacy: pickLegacyFields(body),
    code: body.assetId ?? null,
    sourceRef: body.sourceRef ?? null,
  };

  let outcome: Outcome;
  try {
    outcome = runLegacyMutation(db, { op: 'item.create', entityId: id, args, baseRevision: null });
  } catch (err) {
    if (
      typeof body.sourceRef === 'string' &&
      body.sourceRef.length > 0 &&
      isSourceRefConflict(err)
    ) {
      const existing = service.getBySourceRef(db, body.sourceRef);
      if (existing) {
        return {
          status: 201 as const,
          body: { data: toInventoryItem(existing), message: 'Inventory item created' },
        };
      }
    }
    throw err;
  }
  if (outcome.status !== 'applied') throwForItemOutcome(outcome, placementTarget(body));

  return {
    status: 201 as const,
    body: {
      data: toInventoryItem(service.getInventoryItem(db, id)),
      message: 'Inventory item created',
    },
  };
}

function handleUpdate(db: InventoryDb, id: string, body: Req['update']['body']) {
  let current: ItemRow = service.getInventoryItem(db, id);

  const placement = wirePlacementForUpdate(current, body);
  if (placement !== undefined) {
    applyItemMutation(db, {
      op: 'item.move',
      entityId: id,
      args: { to: placement, verb: placement.kind === 'hand' ? 'pick_up' : 'move' },
      baseRevision: current.revision,
      target: placementTarget(body),
    });
    current = service.getInventoryItem(db, id);
  }

  if (body.assetId !== undefined) {
    applyItemMutation(db, {
      op: 'item.setCode',
      entityId: id,
      args: { code: body.assetId },
      baseRevision: current.revision,
    });
    current = service.getInventoryItem(db, id);
  }

  const legacy = pickLegacyFields(body);
  if (body.itemName !== undefined || body.notes !== undefined || Object.keys(legacy).length > 0) {
    applyItemMutation(db, {
      op: 'item.edit',
      entityId: id,
      args: { name: body.itemName, note: body.notes, legacy },
      baseRevision: current.revision,
    });
  }

  return {
    status: 200 as const,
    body: {
      data: toInventoryItem(service.getInventoryItem(db, id)),
      message: 'Inventory item updated',
    },
  };
}

function handleDelete(db: InventoryDb, id: string) {
  const current = service.getInventoryItem(db, id);
  applyItemMutation(db, {
    op: 'item.delete',
    entityId: id,
    args: {},
    baseRevision: current.revision,
  });
  return { status: 200 as const, body: { message: 'Inventory item deleted' } };
}

/** The mutating handlers of the `items.*` sub-router. */
export function makeItemsWriteHandlers(db: InventoryDb) {
  return {
    create: ({ body }: Req['create']) => runHttp(() => handleCreate(db, body)),
    update: ({ params, body }: Req['update']) => runHttp(() => handleUpdate(db, params.id, body)),
    delete: ({ params }: Req['delete']) => runHttp(() => handleDelete(db, params.id)),
  };
}
