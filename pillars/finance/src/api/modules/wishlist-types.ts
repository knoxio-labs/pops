/**
 * Wire mapper for the wish-list domain. The zod schemas now live in the
 * REST contract (`src/contract/rest-wishlist.ts`); this file keeps only
 * the row → response projection and its TS shape.
 *
 * Money crosses from the pillar's internal integer-cents representation
 * (#3665, CF041) to the decimal-dollar wire contract exactly here.
 * `remainingAmount` (`targetAmountCents - savedCents`) is computed in cents,
 * THEN converted, so it never repeats the float-subtraction bug this pillar
 * was built to fix (`100.10 - 100.00 -> 0.09999999999999432` in JS floats).
 */
import { centsToDollarsNullable, dollarsToCentsNullable } from '../../money.js';

import type {
  CreateWishListItemInput,
  UpdateWishListItemInput,
  WishListPriority,
  WishListRow,
} from '../../db/index.js';

/** API response shape (camelCase). */
export interface WishListItem {
  id: string;
  item: string;
  targetAmount: number | null;
  saved: number | null;
  remainingAmount: number | null;
  priority: string | null;
  url: string | null;
  notes: string | null;
  lastEditedTime: string;
}

/** Wire body accepted by `POST /wishlist` (dollars `targetAmount`/`saved`). */
export interface CreateWishListItemBody {
  item: string;
  targetAmount?: number | null;
  saved?: number | null;
  priority?: WishListPriority | null;
  url?: string | null;
  notes?: string | null;
}

/** Wire body accepted by `PATCH /wishlist/:id` (dollars `targetAmount`/`saved`). */
export interface UpdateWishListItemBody {
  item?: string;
  targetAmount?: number | null;
  saved?: number | null;
  priority?: WishListPriority | null;
  url?: string | null;
  notes?: string | null;
}

/**
 * Map a SQLite row to the API response shape. Computes `remainingAmount`
 * as `targetAmountCents - savedCents` in integer cents, or `null` if either
 * is null, before converting the result to dollars for the wire.
 */
export function toWishListItem(row: WishListRow): WishListItem {
  const remainingAmountCents =
    row.targetAmountCents !== null && row.savedCents !== null
      ? row.targetAmountCents - row.savedCents
      : null;

  return {
    id: row.id,
    item: row.item,
    targetAmount: centsToDollarsNullable(row.targetAmountCents),
    saved: centsToDollarsNullable(row.savedCents),
    remainingAmount: centsToDollarsNullable(remainingAmountCents),
    priority: row.priority,
    url: row.url,
    notes: row.notes,
    lastEditedTime: row.lastEditedTime,
  };
}

/** Map a create request body to the persistence layer's input shape. */
export function toCreateWishListItemInput(body: CreateWishListItemBody): CreateWishListItemInput {
  return {
    item: body.item,
    targetAmountCents: dollarsToCentsNullable(body.targetAmount),
    savedCents: dollarsToCentsNullable(body.saved),
    priority: body.priority,
    url: body.url,
    notes: body.notes,
  };
}

/** Map an update request body to the persistence layer's input shape. */
export function toUpdateWishListItemInput(body: UpdateWishListItemBody): UpdateWishListItemInput {
  return {
    item: body.item,
    targetAmountCents:
      body.targetAmount === undefined ? undefined : dollarsToCentsNullable(body.targetAmount),
    savedCents: body.saved === undefined ? undefined : dollarsToCentsNullable(body.saved),
    priority: body.priority,
    url: body.url,
    notes: body.notes,
  };
}
