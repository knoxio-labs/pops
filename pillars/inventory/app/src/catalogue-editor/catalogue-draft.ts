import type { CatalogueDescriptor } from './types';

/** Returns the published revision against which a draft operation must be checked. */
export function draftBaseRevision(draft: CatalogueDescriptor): number {
  const baseRevision = draft.revision.baseRevision;
  if (baseRevision === null) throw new Error('Draft does not name a published base revision');
  return baseRevision;
}
