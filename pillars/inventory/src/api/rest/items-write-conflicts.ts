/**
 * The legacy `/items` write handlers' own conflict resolution, split out of
 * `items-write-handlers.ts` to stay under the file line budget: what a
 * `code_collision` conflict says, and what `item.create`'s own insert
 * resolves to when it raises a raw unique-index error rather than a typed
 * outcome (POPS-4053).
 */
import { isCodeConflict } from '../../db/services/code-conflict.js';
import { isSourceRefConflict } from '../../db/services/source-ref-conflict.js';
import * as service from '../modules/items/service.js';

import type { InventoryDb } from '../../db/index.js';
import type { ItemRow } from '../modules/items/types.js';

/** The fields of a legacy create body `resolveCreateInsertError` needs. */
export interface CreateInsertBody {
  readonly assetId?: string | null;
  readonly sourceRef?: string | null;
}

/**
 * The 409 message for a `code_collision`, naming whether the holder is a
 * deleted item (POPS-4053/4124: a printed code stays reserved to whoever
 * last wore it, so reusing it while that item is only tombstoned is still a
 * collision, and the message says so rather than implying a live item).
 */
export function formatCodeCollisionMessage(holderName: string, holderIsDeleted: boolean): string {
  return holderIsDeleted
    ? `Asset id already held by a deleted item (${holderName})`
    : `Asset id already used by ${holderName}`;
}

/**
 * What `item.create`'s own insert resolves an unhandled unique-index error
 * to: unlike `item.setCode`, the create path writes `assetId` and
 * `sourceRef` unchecked, so a collision on either surfaces from the raw
 * insert rather than a typed outcome. `existingRow` replays the fan-out's
 * earlier create (a `sourceRef` held only by a deleted item never reaches
 * this: POPS-4053 scopes that index to live rows, so a hit here always names
 * a still-live row). `conflict` is a clean 409 for a `code` held by any
 * item, live or deleted (POPS-4124 keeps that index unscoped), instead of
 * the raw constraint surfacing as an unhandled 500.
 */
export type CreateInsertResolution =
  | { readonly kind: 'existingRow'; readonly row: ItemRow }
  | { readonly kind: 'conflict'; readonly message: string }
  | { readonly kind: 'rethrow' };

export function resolveCreateInsertError(
  db: InventoryDb,
  body: CreateInsertBody,
  err: unknown
): CreateInsertResolution {
  if (typeof body.sourceRef === 'string' && body.sourceRef.length > 0 && isSourceRefConflict(err)) {
    const existing = service.getBySourceRef(db, body.sourceRef);
    if (existing) return { kind: 'existingRow', row: existing };
  }
  if (typeof body.assetId === 'string' && body.assetId.length > 0 && isCodeConflict(err)) {
    const holder = service.findCodeHolder(db, body.assetId);
    if (holder) {
      return {
        kind: 'conflict',
        message: formatCodeCollisionMessage(holder.name, holder.deletedAt != null),
      };
    }
  }
  return { kind: 'rethrow' };
}
