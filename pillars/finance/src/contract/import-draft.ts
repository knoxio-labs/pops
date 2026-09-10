/**
 * The vocabulary of a pending import (POPS-3308, finance ADR-005): the enums
 * the `import_drafts` table shares with the REST contract, and the two
 * constants every reader of a draft agrees on.
 */

/**
 * Who started the draft. A `file` draft exists because a person uploaded
 * something; a `live` draft exists because a provider sent rows. The kind
 * decides which wizard steps exist: a live draft has nothing to upload or map.
 */
export const IMPORT_DRAFT_SOURCE_KINDS = ['file', 'live'] as const;

/** One member of {@link IMPORT_DRAFT_SOURCE_KINDS}. */
export type ImportDraftSourceKind = (typeof IMPORT_DRAFT_SOURCE_KINDS)[number];

/**
 * The two states a draft is stored in. `live` is a draft only the bank has
 * touched: it keeps accepting arrivals, and there is at most one per account.
 * `saved` is a draft a person has opened, so it never changes under them;
 * arrivals after that point go to a new `live` draft. Everything else a card
 * shows (`open`, `left-open`, `unusable`) is derived on read from the
 * ownership columns, the shape version and the account, never stored.
 */
export const IMPORT_DRAFT_STORED_STATES = ['saved', 'live'] as const;

/** One member of {@link IMPORT_DRAFT_STORED_STATES}. */
export type ImportDraftStoredState = (typeof IMPORT_DRAFT_STORED_STATES)[number];

/**
 * The shape of `import_drafts.payload`. Bump it whenever the persisted
 * wizard state changes in a way an older build's rows cannot be read under;
 * a stored row whose version differs from this constant reads as `unusable`
 * and offers only Discard. Nothing migrates a draft across versions: the
 * file is not stored, so there is nothing to re-derive it from.
 */
export const IMPORT_DRAFT_SHAPE_VERSION = 1;

/**
 * How long an owner's silence is taken as "still in it". A tab heartbeats
 * every 30 seconds while mounted; one that has not been heard from for a day
 * is a tab that closed without releasing (a crash, a killed browser). A
 * claim replaces such an owner without `force`, and the card reads
 * `left-open` rather than `open`.
 */
export const IMPORT_DRAFT_OWNER_STALE_MS = 24 * 60 * 60 * 1000;

/** Whether an owner last seen at `seenAt` counts as gone by `now`. */
export function isOwnerStale(seenAt: string | null, now: Date): boolean {
  if (seenAt === null) return true;
  return now.getTime() - Date.parse(seenAt) > IMPORT_DRAFT_OWNER_STALE_MS;
}
