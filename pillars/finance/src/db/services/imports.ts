/**
 * Persistence helpers for the finance imports slice.
 *
 * This module holds only the pure-persistence primitives the import pipeline
 * uses against `transactions`:
 *
 *   - `findExistingChecksums` — checksum dedup probe (read-only)
 *   - `buildEntityMaps`       — name + alias lookup builder over a fetched set
 *   - `insertImportTransaction` — low-level transactions insert (write)
 *
 * The imports slice owns NO tables of its own. Entities are not mirrored in
 * finance: the matcher fetches the contact set from the contacts pillar per
 * import run and `buildEntityMaps` turns that fetched set into the
 * lookup/alias maps in memory.
 *
 * Follows the standard service pattern: db-arg services, plain functions,
 * typed domain errors, no HTTP concerns.
 */
import { eq, inArray } from 'drizzle-orm';

import { ImportTransactionPersistError } from '../errors.js';
import { transactions } from '../schema.js';
import { resolveImportAccountId } from './account-lookup.js';

import type { ContactEntity } from '../../api/contacts/client.js';
import type { TransactionType } from '../../contract/corrections-constants.js';
import type { FxCaptureSource } from '../../contract/fx-capture.js';
import type { TransactionMatchType } from '../match-types.js';
import type { FinanceDb } from './internal.js';

/** Single entry in the entity name lookup map. */
export interface EntityLookupEntry {
  id: string;
  /** Original-case entity name as stored in the contacts pillar. */
  name: string;
  /**
   * Contact entity type (e.g. `company`, `person`, `government`) — used to keep
   * personal-name PII out of AI prompts. Optional because only the live
   * `buildEntityMaps` path (which always sets it) needs it; local matcher
   * fixtures may omit it.
   */
  type?: string;
}

/** Two pre-built maps consumed by the import matching stages. */
export interface EntityMaps {
  /** Lowercase entity name → `{ id, name (original case) }`. */
  entityLookup: Map<string, EntityLookupEntry>;
  /** Lowercase alias → entity name (original case). */
  aliasMap: Map<string, string>;
}

/** Mutable subset accepted on `insertImportTransaction`. */
export interface InsertImportTransactionInput {
  description: string;
  account: string;
  /**
   * The real `accounts.id` the wizard's account-step (POPS-2840) picked for
   * this import. Preferred over `account` when supplied — see
   * {@link resolveAccountIdentity}. Optional so a caller with no picker (a
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

const CHECKSUM_BATCH_SIZE = 500;

/**
 * Return the subset of `checksums` that already exist in the
 * `transactions` table. Empty input returns an empty set without
 * issuing a query.
 *
 * Batched at 500 per IN-list to stay under SQLite's `SQLITE_MAX_VARIABLE_NUMBER`
 * limit (default 999).
 */
export function findExistingChecksums(db: FinanceDb, checksums: string[]): Set<string> {
  if (checksums.length === 0) return new Set();

  const existing = new Set<string>();
  for (let i = 0; i < checksums.length; i += CHECKSUM_BATCH_SIZE) {
    const batch = checksums.slice(i, i + CHECKSUM_BATCH_SIZE);
    const rows = db
      .select({ checksum: transactions.checksum })
      .from(transactions)
      .where(inArray(transactions.checksum, batch))
      .all();
    for (const row of rows) {
      if (row.checksum) existing.add(row.checksum);
    }
  }

  return existing;
}

/**
 * Build the entity lookup + alias maps consumed by the import matching
 * stages from a contact set fetched live from the contacts pillar. Pure —
 * no DB access; the caller fetches the set once per import run and feeds it
 * here, so the maps reflect the live contacts data with no persistent mirror.
 *
 * - Lookup keys are lowercased for O(1) case-insensitive lookups.
 * - Values preserve the original-case name for display.
 * - Aliases arrive already split into arrays from the contacts wire shape;
 *   whitespace-only aliases are dropped.
 */
export function buildEntityMaps(contacts: ContactEntity[]): EntityMaps {
  const entityLookup = new Map<string, EntityLookupEntry>();
  const aliasMap = new Map<string, string>();

  for (const contact of contacts) {
    entityLookup.set(contact.name.toLowerCase(), {
      id: contact.id,
      name: contact.name,
      type: contact.type,
    });
    for (const raw of contact.aliases) {
      const alias = raw.trim();
      if (alias.length === 0) continue;
      aliasMap.set(alias.toLowerCase(), contact.name);
    }
  }

  return { entityLookup, aliasMap };
}

/**
 * Build the `entityId → defaultTags` map the tag-suggester's entity-default
 * stage consumes, from the same fetched contact set. Pure — one in-memory map
 * per import run, no per-transaction DB read.
 */
export function buildDefaultTagsByEntity(contacts: ContactEntity[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const contact of contacts) {
    if (contact.defaultTags.length > 0) map.set(contact.id, contact.defaultTags);
  }
  return map;
}

/**
 * Insert a single transaction during the commit phase of an import.
 *
 * The full atomic commit pipeline (changeset application, tag-rule changesets,
 * reclassification of existing transactions) is cross-slice orchestration that
 * lives above the persistence layer; this primitive only writes the row.
 *
 * `accountId` is resolved via {@link resolveImportAccountId} rather than
 * name-matching `account` on its own (POPS-2852). Before the import wizard's
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
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(transactions)
    .values({
      id,
      description: input.description,
      account: input.account,
      accountId: resolveImportAccountId(db, input.account, input.accountId),
      amountCents: input.amountCents,
      date: input.date,
      type: input.type,
      tags: JSON.stringify(input.tags),
      entityId: input.entityId,
      entityName: input.entityName,
      location: input.location,
      country: input.country ?? null,
      foreignAmountMinor: input.foreignAmountMinor ?? null,
      foreignCurrency: input.foreignCurrency ?? null,
      fxFeeCents: input.fxFeeCents ?? null,
      fxCaptureSource: input.fxCaptureSource ?? null,
      checksum: input.checksum ?? null,
      rawRow: input.rawRow ?? null,
      lastEditedTime: now,
      matchType: input.matchType ?? null,
      matchRuleId: input.matchRuleId ?? null,
      matchConfidence: input.matchConfidence ?? null,
    })
    .run();

  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!row) throw new ImportTransactionPersistError(id);
  return row;
}
