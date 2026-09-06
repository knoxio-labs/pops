/**
 * Persistence for the finance imports slice, and the entry point that names
 * all of it.
 *
 * The write itself — one staged row becoming one `transactions` row — is here.
 * Two groups this file used to carry were split out at POPS-3068, when it sat
 * seven lines under the 200-line cap with two branches editing the import write
 * path concurrently:
 *
 *   - `import-checksums.ts`   — dedup probe, settle-check lookup, settle write
 *   - `import-entity-maps.ts` — the pure lookup/alias builders, no DB at all
 *
 * They are re-exported below rather than left for callers to find, because
 * every call site reaches this slice through the `importsService` namespace
 * `../exports/imports.ts` builds from this module; splitting the file is not a
 * reason to make eighteen call sites learn three names for one slice.
 *
 * The imports slice owns NO tables of its own. Entities are not mirrored in
 * finance: the matcher fetches the contact set from the contacts pillar per
 * import run and `buildEntityMaps` turns that fetched set into the
 * lookup/alias maps in memory.
 *
 * Follows the standard service pattern: db-arg services, plain functions,
 * typed domain errors, no HTTP concerns.
 */
import { eq } from 'drizzle-orm';

import { isPositiveAmountPurchase } from '../../contract/corrections-constants.js';
import { ImportTransactionPersistError, PositiveAmountPurchaseError } from '../errors.js';
import { transactions } from '../schema.js';
import { resolveImportAccountId } from './account-lookup.js';

import type { TransactionType } from '../../contract/corrections-constants.js';
import type { FxCaptureSource } from '../../contract/fx-capture.js';
import type { TransactionMatchType } from '../match-types.js';
import type { FinanceDb } from './internal.js';

export * from './import-checksums.js';
export * from './import-entity-maps.js';

/** Mutable subset accepted on `insertImportTransaction`. */
export interface InsertImportTransactionInput {
  description: string;
  dialectAccountLabel: string;
  /**
   * The real `accounts.id` the wizard's account-step (POPS-2840) picked for
   * this import. Preferred over `dialectAccountLabel` when supplied — see
   * {@link resolveImportAccountId}. Optional so a caller with no picker (a
   * legacy client, or a fixture predating it) can still resolve by name.
   */
  accountId?: string;
  amountCents: number;
  date: string;
  type: TransactionType;
  tags: string[];
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  country?: string | null;
  /** Amount charged abroad, in `foreignCurrency`'s own ISO-4217 minor units. */
  foreignAmountMinor?: number | null;
  /** ISO-4217 alpha-3 of the charge abroad. */
  foreignCurrency?: string | null;
  /** The issuer's foreign-transaction fee in AUD cents — a fee, not a converted total. */
  fxFeeCents?: number | null;
  /** Which capture path read (or could not read) this row's foreign charge — see schema doc. */
  fxCaptureSource?: FxCaptureSource | null;
  /** Unsettled at the source (POPS-30); false for every file import. */
  pending?: boolean;
  rawRow?: string;
  checksum?: string;
  /** How the entity assignment was produced (CF057/#3658) — nullable, see schema doc. */
  matchType?: TransactionMatchType | null;
  /** Winning correction rule id, only set when `matchType` is `learned`. */
  matchRuleId?: string | null;
  /** Match confidence (0-1), only set for `ai`/`learned` matches. */
  matchConfidence?: number | null;
}

/** Raw drizzle row shape returned by `insertImportTransaction`. */
export type ImportTransactionRow = typeof transactions.$inferSelect;

/** The wire optionals collapsed to their column defaults. */
function optionalColumns(input: InsertImportTransactionInput): {
  country: string | null;
  foreignAmountMinor: number | null;
  foreignCurrency: string | null;
  fxFeeCents: number | null;
  fxCaptureSource: FxCaptureSource | null;
  checksum: string | null;
  rawRow: string | null;
  pending: boolean;
  matchType: InsertImportTransactionInput['matchType'] | null;
  matchRuleId: string | null;
  matchConfidence: number | null;
} {
  return {
    country: input.country ?? null,
    foreignAmountMinor: input.foreignAmountMinor ?? null,
    foreignCurrency: input.foreignCurrency ?? null,
    fxFeeCents: input.fxFeeCents ?? null,
    fxCaptureSource: input.fxCaptureSource ?? null,
    checksum: input.checksum ?? null,
    rawRow: input.rawRow ?? null,
    pending: input.pending ?? false,
    matchType: input.matchType ?? null,
    matchRuleId: input.matchRuleId ?? null,
    matchConfidence: input.matchConfidence ?? null,
  };
}

/**
 * Insert a single transaction during the commit phase of an import.
 *
 * The full atomic commit pipeline (changeset application, tag-rule changesets,
 * reclassification of existing transactions) is cross-slice orchestration that
 * lives above the persistence layer; this primitive only writes the row.
 *
 * `accountId` is resolved via {@link resolveImportAccountId} rather than
 * name-matching `dialectAccountLabel` on its own (POPS-2852). Before the import wizard's
 * account-step (POPS-2840) gave every row a real `accountId`, this had no
 * choice but to name-match the bank/dialect label against `accounts.name`,
 * which silently mis-resolved whenever two real accounts happened to share a
 * dialect (two ANZ cards, say) or an account's real name did not literally
 * match the dialect string. A caller with no `accountId` — a legacy client,
 * or a fixture predating the picker — still resolves by name.
 *
 * Throws `ImportTransactionPersistError` if the row is not readable after the
 * insert — a defensive check against silent SQLite write failures.
 */
export function insertImportTransaction(
  db: FinanceDb,
  input: InsertImportTransactionInput
): ImportTransactionRow {
  // The commit path CAN express the combination, so it is guarded rather than
  // assumed safe. The automatic classifier will not produce one — a credit
  // whose entity resolves is left `uncertain` with no defaulted type — but the
  // type a commit carries can also come from the review wizard, which is where
  // POPS-2680's rows came from. Throwing rolls the whole commit back, which is
  // the point: a batch is atomic, so the alternative is storing the bad row
  // alongside the good ones and finding it months later by migration.
  if (isPositiveAmountPurchase(input.amountCents, input.type)) {
    throw new PositiveAmountPurchaseError(input.amountCents);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(transactions)
    .values({
      id,
      description: input.description,
      accountId: resolveImportAccountId(db, input.dialectAccountLabel, input.accountId),
      amountCents: input.amountCents,
      date: input.date,
      type: input.type,
      tags: JSON.stringify(input.tags),
      entityId: input.entityId,
      entityName: input.entityName,
      location: input.location,
      ...optionalColumns(input),
      lastEditedTime: now,
    })
    .run();

  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!row) throw new ImportTransactionPersistError(id);
  return row;
}
