/**
 * Data access for `import_drafts` (POPS-3328, finance ADR-005): the pending
 * imports, whoever started them.
 *
 * Two rules live here and nowhere else. A `live` draft is the one place an
 * account's arrivals go, so there is at most one per account and it stops
 * being `live` the moment a person claims it: from then on it is theirs and
 * never changes under them. And ownership is a lease: a write or a
 * heartbeat from a token that is not the owner is refused, a claim replaces
 * an owner that has gone quiet, and a release from a token that no longer
 * owns the draft is ignored rather than allowed to evict the tab that does.
 *
 * What the layer does not decide: whether a draft is readable by this build
 * (`shape_version` against the constant) or whether its account is still
 * there. Both are the read path's verdict; see the routes.
 */
import { and, desc, eq } from 'drizzle-orm';

import {
  IMPORT_DRAFT_SHAPE_VERSION,
  type ImportDraftSourceKind,
  type ImportDraftStoredState,
  isOwnerStale,
} from '../../contract/import-draft.js';
import { DraftOwnedElsewhereError, ImportDraftNotFoundError } from '../errors.js';
import { importDrafts } from '../schema.js';

import type { ImportProvider } from '../../contract/import-source.js';
import type { FinanceDb } from './internal.js';

/** Raw drizzle row shape for `import_drafts`. */
export type ImportDraftRow = typeof importDrafts.$inferSelect;

/** The denormalised card fields every write keeps in step with the payload. */
export interface ImportDraftCounts {
  rowCount: number;
  unresolvedCount: number;
  dateFrom: string | null;
  dateTo: string | null;
  balanceReportedCents?: number | null;
}

/** Fields accepted by {@link createImportDraft}. */
export interface CreateImportDraftInput extends ImportDraftCounts {
  accountId: string;
  sourceKind: ImportDraftSourceKind;
  state: ImportDraftStoredState;
  provider?: ImportProvider | null;
  dialectId?: string | null;
  sourceFileNames?: string[] | null;
  step?: number | null;
  /** Serialised payload; the caller owns the JSON so the service never parses forty drafts. */
  payload: string;
  processSessionId?: string | null;
}

/** Fields accepted by {@link writeImportDraft}; a write replaces the payload and every count with it. */
export interface WriteImportDraftInput extends ImportDraftCounts {
  payload: string;
  step?: number | null;
  processSessionId?: string | null;
}

export interface ListImportDraftsFilter {
  accountId?: string;
  state?: ImportDraftStoredState;
}

function requireDraft(db: FinanceDb, id: string): ImportDraftRow {
  const row = getImportDraft(db, id);
  if (row === undefined) throw new ImportDraftNotFoundError(id);
  return row;
}

function serialiseFileNames(names: string[] | null | undefined): string | null {
  return names && names.length > 0 ? JSON.stringify(names) : null;
}

/** The file names a draft was created from, or none for a live draft. */
export function fileNamesOf(row: Pick<ImportDraftRow, 'sourceFileNames'>): string[] {
  if (row.sourceFileNames === null) return [];
  const parsed: unknown = JSON.parse(row.sourceFileNames);
  return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : [];
}

/** Create a draft stamped with the running build's shape version. */
export function createImportDraft(
  db: FinanceDb,
  input: CreateImportDraftInput,
  now: Date = new Date()
): ImportDraftRow {
  return db
    .insert(importDrafts)
    .values({
      accountId: input.accountId,
      sourceKind: input.sourceKind,
      provider: input.provider ?? null,
      dialectId: input.dialectId ?? null,
      sourceFileNames: serialiseFileNames(input.sourceFileNames),
      state: input.state,
      step: input.step ?? null,
      shapeVersion: IMPORT_DRAFT_SHAPE_VERSION,
      payload: input.payload,
      rowCount: input.rowCount,
      unresolvedCount: input.unresolvedCount,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      balanceReportedCents: input.balanceReportedCents ?? null,
      processSessionId: input.processSessionId ?? null,
      savedAt: now.toISOString(),
    })
    .returning()
    .get();
}

export function getImportDraft(db: FinanceDb, id: string): ImportDraftRow | undefined {
  return db.select().from(importDrafts).where(eq(importDrafts.id, id)).get();
}

/** Every draft matching the filter, most recently saved first. */
export function listImportDrafts(
  db: FinanceDb,
  filter: ListImportDraftsFilter = {}
): ImportDraftRow[] {
  const conditions = [];
  if (filter.accountId !== undefined) conditions.push(eq(importDrafts.accountId, filter.accountId));
  if (filter.state !== undefined) conditions.push(eq(importDrafts.state, filter.state));
  return db
    .select()
    .from(importDrafts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(importDrafts.savedAt), desc(importDrafts.createdAt))
    .all();
}

/**
 * The draft collecting an account's arrivals, or none. Never a draft a
 * person has claimed: claiming turns it `saved`, so the query needs no
 * ownership clause.
 */
export function liveDraftFor(db: FinanceDb, accountId: string): ImportDraftRow | undefined {
  return db
    .select()
    .from(importDrafts)
    .where(and(eq(importDrafts.accountId, accountId), eq(importDrafts.state, 'live')))
    .get();
}

function assertOwnedBy(draft: ImportDraftRow, ownerToken: string | null): void {
  if (draft.ownerToken !== null && draft.ownerToken !== ownerToken) {
    throw new DraftOwnedElsewhereError(draft.id, draft.ownerSeenAt);
  }
}

/**
 * Replace the payload, step and counts, bumping `saved_at`. Refused when
 * another token holds the lease; a draft nobody holds (a live one the bank
 * is filling) accepts a write from the server with no token.
 *
 * @throws {ImportDraftNotFoundError}
 * @throws {DraftOwnedElsewhereError}
 */
export function writeImportDraft(
  db: FinanceDb,
  id: string,
  input: WriteImportDraftInput,
  options: { ownerToken?: string | null; now?: Date } = {}
): ImportDraftRow {
  const ownerToken = options.ownerToken ?? null;
  const now = options.now ?? new Date();
  const draft = requireDraft(db, id);
  assertOwnedBy(draft, ownerToken);
  return db
    .update(importDrafts)
    .set({
      payload: input.payload,
      step: input.step === undefined ? draft.step : input.step,
      rowCount: input.rowCount,
      unresolvedCount: input.unresolvedCount,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      balanceReportedCents:
        input.balanceReportedCents === undefined
          ? draft.balanceReportedCents
          : input.balanceReportedCents,
      processSessionId:
        input.processSessionId === undefined ? draft.processSessionId : input.processSessionId,
      shapeVersion: IMPORT_DRAFT_SHAPE_VERSION,
      savedAt: now.toISOString(),
      ...(ownerToken === null ? {} : { ownerSeenAt: now.toISOString() }),
    })
    .where(eq(importDrafts.id, id))
    .returning()
    .get();
}

/**
 * Take the lease. Succeeds when nobody holds it, when this token already
 * does, when the holder has gone stale, or when `force` is set (the card's
 * "Take over here"). A live draft becomes `saved` here: from this point it
 * is one person's and arrivals go elsewhere.
 *
 * `step` is left exactly as it was, null included. Which step a
 * never-opened draft opens on depends on where its rows came from — a live
 * draft has nothing to upload or map — and that is the wizard's decision to
 * make from the payload, not a number to invent here.
 *
 * @throws {ImportDraftNotFoundError}
 * @throws {DraftOwnedElsewhereError} when a live owner holds it and `force` is not set.
 */
export function claimImportDraft(
  db: FinanceDb,
  id: string,
  ownerToken: string,
  options: { force?: boolean; now?: Date } = {}
): ImportDraftRow {
  const now = options.now ?? new Date();
  const draft = requireDraft(db, id);
  const held =
    draft.ownerToken !== null &&
    draft.ownerToken !== ownerToken &&
    !isOwnerStale(draft.ownerSeenAt, now);
  if (held && !options.force) throw new DraftOwnedElsewhereError(id, draft.ownerSeenAt);
  return db
    .update(importDrafts)
    .set({ ownerToken, ownerSeenAt: now.toISOString(), state: 'saved' })
    .where(eq(importDrafts.id, id))
    .returning()
    .get();
}

/**
 * Prove the tab is still in it.
 *
 * @throws {ImportDraftNotFoundError}
 * @throws {DraftOwnedElsewhereError} when the lease has moved, including to nobody.
 */
export function heartbeatImportDraft(
  db: FinanceDb,
  id: string,
  ownerToken: string,
  now: Date = new Date()
): ImportDraftRow {
  const draft = requireDraft(db, id);
  if (draft.ownerToken !== ownerToken) throw new DraftOwnedElsewhereError(id, draft.ownerSeenAt);
  return db
    .update(importDrafts)
    .set({ ownerSeenAt: now.toISOString() })
    .where(eq(importDrafts.id, id))
    .returning()
    .get();
}

/**
 * Give the lease up. A token that no longer holds it changes nothing: a
 * tab closing late must not evict the tab that took over.
 */
export function releaseImportDraft(db: FinanceDb, id: string, ownerToken: string): boolean {
  const draft = getImportDraft(db, id);
  if (draft === undefined || draft.ownerToken !== ownerToken) return false;
  db.update(importDrafts)
    .set({ ownerToken: null, ownerSeenAt: null })
    .where(eq(importDrafts.id, id))
    .run();
  return true;
}

/** Hard delete. False when there was nothing to delete. */
export function discardImportDraft(db: FinanceDb, id: string): boolean {
  return db.delete(importDrafts).where(eq(importDrafts.id, id)).returning().get() !== undefined;
}
