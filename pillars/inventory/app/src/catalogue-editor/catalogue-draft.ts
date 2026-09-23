import type { CatalogueDescriptor } from './types';

const STALE_DRAFT_CODES: ReadonlySet<string> = new Set([
  'catalogue_conflict',
  'catalogue_draft_conflict',
]);

/**
 * The preconditions every draft call carries: the published revision the draft
 * is based on and the draft version this editor last read. The server refuses
 * the call with `catalogue_draft_conflict` once the version is stale.
 */
export function draftPreconditions(draft: CatalogueDescriptor): {
  baseRevision: number;
  expectedDraftVersion: number;
} {
  const baseRevision = draft.revision.baseRevision;
  if (baseRevision === null) throw new Error('Draft does not name a published base revision');
  return { baseRevision, expectedDraftVersion: draft.revision.draftVersion };
}

/** True when a failed draft call means another session changed the draft or its base. */
export function isStaleDraftCode(code: string | undefined): boolean {
  return code !== undefined && STALE_DRAFT_CODES.has(code);
}
