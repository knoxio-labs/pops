/**
 * Row → wire projection for pending imports (POPS-3329, finance ADR-005), and
 * the one verdict the read path owns: which state a card shows.
 *
 * The stored row knows `saved` or `live`. Everything else is decided here,
 * in this order: a payload written under another shape version, or an
 * account that has since been archived, makes the draft `unusable` whatever
 * else is true of it; otherwise an owner seen inside the stale window makes
 * it `open`, one seen past it `left-open`; otherwise the stored state
 * stands. The reason text is worded for the card, which shows it verbatim.
 */
import { IMPORT_DRAFT_SHAPE_VERSION, isOwnerStale } from '../../contract/import-draft.js';
import { fileNamesOf } from '../../db/services/import-drafts.js';

import type { ImportProvider } from '../../contract/import-source.js';
import type {
  ImportDraft,
  ImportDraftSource,
  ImportDraftState,
  ImportDraftSummary,
  ImportDraftUnusableCause,
} from '../../contract/rest-import-drafts-schemas.js';
import type { AccountRow } from '../../db/index.js';
import type { ImportDraftRow } from '../../db/services/import-drafts.js';

export type { ImportDraft, ImportDraftSummary };

export interface DraftVerdict {
  state: ImportDraftState;
  unusableCause: ImportDraftUnusableCause | null;
  unusableReason: string | null;
}

function archivedOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function shapeReason(row: ImportDraftRow): string {
  return row.sourceKind === 'live'
    ? 'Saved before this version was deployed. Its rows are in a shape this version no longer ' +
        'reads; discard it and the next sync fetches them again.'
    : 'Saved before this version was deployed. Its rows are in a shape this version no longer ' +
        'reads, and the file is not stored: upload it again to redo the import.';
}

/** The state a card shows for this row, given its account as it is now. */
export function draftVerdict(row: ImportDraftRow, account: AccountRow, now: Date): DraftVerdict {
  if (row.shapeVersion !== IMPORT_DRAFT_SHAPE_VERSION) {
    return { state: 'unusable', unusableCause: 'shape', unusableReason: shapeReason(row) };
  }
  if (account.archivedAt !== null) {
    return {
      state: 'unusable',
      unusableCause: 'account-archived',
      unusableReason:
        `${account.name} was archived on ${archivedOn(account.archivedAt)}, so nothing can be ` +
        'filed against it. Restore the account to resume this, or discard it.',
    };
  }
  if (row.ownerToken !== null) {
    return {
      state: isOwnerStale(row.ownerSeenAt, now) ? 'left-open' : 'open',
      unusableCause: null,
      unusableReason: null,
    };
  }
  return { state: row.state, unusableCause: null, unusableReason: null };
}

function sourceOf(row: ImportDraftRow): ImportDraftSource {
  if (row.sourceKind === 'live') {
    // A live row always names its provider: the Up path writes both together.
    const provider: ImportProvider = row.provider ?? 'up';
    return { kind: 'live', provider };
  }
  return { kind: 'file', dialectId: row.dialectId, fileNames: fileNamesOf(row) };
}

export function toImportDraftSummary(
  row: ImportDraftRow,
  account: AccountRow,
  now: Date
): ImportDraftSummary {
  const span =
    row.dateFrom !== null && row.dateTo !== null ? { from: row.dateFrom, to: row.dateTo } : null;
  return {
    id: row.id,
    accountId: row.accountId,
    source: sourceOf(row),
    step: row.step,
    rowCount: row.rowCount,
    unresolvedCount: row.unresolvedCount,
    span,
    balanceReportedCents: row.balanceReportedCents,
    processSessionId: row.processSessionId,
    savedAt: row.savedAt,
    createdAt: row.createdAt,
    ownerSeenAt: row.ownerSeenAt,
    ...draftVerdict(row, account, now),
  };
}

function parsePayload(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed));
}

export function toImportDraft(row: ImportDraftRow, account: AccountRow, now: Date): ImportDraft {
  return {
    ...toImportDraftSummary(row, account, now),
    shapeVersion: row.shapeVersion,
    payload: parsePayload(row.payload),
  };
}
