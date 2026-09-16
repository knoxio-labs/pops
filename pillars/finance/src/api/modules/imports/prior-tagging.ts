/**
 * How a merchant has been tagged before, shown to the tag-only prompt as
 * precedent (POPS-3673).
 *
 * `venue:pub` against `venue:club` is not a world-knowledge question; it is a
 * question about what this user calls a pub, and the ledger already holds the
 * answer for the same merchant. Only the tag sets cross into the prompt: no
 * description, amount or date from another row, so nothing reaches the model
 * that the row's own line does not already carry. Only classified facets are
 * kept, so a `person:` or `trip:` value cannot ride along.
 *
 * Held-out rows (`eval-split.ts`) are skipped, or the eval would score the model
 * on answers it was just shown. Bounded by count and characters like
 * `buildKnownEntityHint`, because this is per-group input on the common path.
 */
import { transactionsService, type FinanceDb } from '../../../db/index.js';
import { isClassifiedTagFacet, parseStoredTags, parseTagFacet } from '../../../db/tag-facets.js';
import { isHeldOut } from './eval-split.js';

/** At most this many distinct prior tag sets per merchant. */
export const MAX_PRIOR_TAG_SETS = 5;

/** At most this many characters of rendered prior tag sets per merchant. */
export const MAX_PRIOR_TAG_SETS_CHARS = 300;

const PRIOR_ROWS_SCANNED = 50;

function classifiedTags(tagsJson: string): string[] {
  return parseStoredTags(tagsJson)
    .filter((tag) => isClassifiedTagFacet(parseTagFacet(tag).facet))
    .toSorted();
}

/**
 * The distinct classified tag sets on the merchant's most recent committed
 * transactions, newest first, within {@link MAX_PRIOR_TAG_SETS} and
 * {@link MAX_PRIOR_TAG_SETS_CHARS}. Empty when the merchant has no tagged
 * history outside the held-out set.
 */
export function loadPriorTagSets(db: FinanceDb, entityId: string): string[][] {
  const { rows } = transactionsService.listTransactions(db, { entityId }, PRIOR_ROWS_SCANNED, 0);
  const seen = new Set<string>();
  const sets: string[][] = [];
  let chars = 0;
  for (const row of rows) {
    if (isHeldOut(row.id)) continue;
    const tags = classifiedTags(row.tags);
    const key = tags.join(', ');
    if (tags.length === 0 || seen.has(key)) continue;
    if (sets.length >= MAX_PRIOR_TAG_SETS || chars + key.length + 2 > MAX_PRIOR_TAG_SETS_CHARS) {
      break;
    }
    seen.add(key);
    sets.push(tags);
    chars += key.length + 2;
  }
  return sets;
}

/** A per-run loader that reads each merchant once, however many groups share it. */
export function createPriorTagSetLoader(db: FinanceDb): (entityId: string) => string[][] {
  const cache = new Map<string, string[][]>();
  return (entityId) => {
    const cached = cache.get(entityId);
    if (cached !== undefined) return cached;
    const sets = loadPriorTagSets(db, entityId);
    cache.set(entityId, sets);
    return sets;
  };
}
