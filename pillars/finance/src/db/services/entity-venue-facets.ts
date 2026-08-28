/**
 * The tag-facet vocabulary the entity `venue:` backfill (POPS-2609) reasons
 * over, and the ledger reads that measure it.
 *
 * The 2026-08-28 tag migration split the flat vocabulary into namespaces. Two
 * of them describe a single transaction (`occasion:`, `contains:`) and one
 * describes the merchant (`venue:`) — which is why the latter belongs on the
 * contact's `defaultTags` and the former two never do. `enrich:` marks a row
 * whose contents the merchant does not determine (Amazon, Bunnings, IKEA), so
 * a venue on such a merchant would be misleading.
 */
import { transactions } from '../schema.js';

import type { FinanceDb } from './internal.js';

/** The merchant-level facet this backfill sets. */
export const VENUE_FACET = 'venue:';
/** Marks a transaction whose contents the merchant does not determine. */
export const ENRICH_FACET = 'enrich:';
/** Facets that describe a single transaction and must never be an entity default. */
export const PER_TRANSACTION_FACETS = ['occasion:', 'contains:'] as const;

/** True for a tag in a namespace that varies per transaction for one merchant. */
export function isPerTransactionFacet(tag: string): boolean {
  return PER_TRANSACTION_FACETS.some((facet) => tag.startsWith(facet));
}

/** True for a tag asserting what kind of place the merchant is. */
export function isVenueTag(tag: string): boolean {
  return tag.startsWith(VENUE_FACET);
}

function parseTags(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

/** What the ledger says about one entity's venue. */
export interface EntityVenueEvidence {
  /** Transactions carrying this `entity_id`. */
  transactionCount: number;
  /** `venue:x` → how many of those transactions assert it. */
  venueCounts: ReadonlyMap<string, number>;
  /** How many carry an `enrich:` tag (any one disqualifies the entity). */
  enrichCount: number;
}

/**
 * Tally, per `entity_id`, the `venue:` values its transactions already carry
 * and whether any of them is `enrich:`-marked. Rows with no entity are ignored:
 * there is no contact to write a default onto.
 */
export function collectEntityVenueEvidence(db: FinanceDb): Map<string, EntityVenueEvidence> {
  const byEntity = new Map<
    string,
    { transactionCount: number; venueCounts: Map<string, number>; enrichCount: number }
  >();

  for (const row of db
    .select({ entityId: transactions.entityId, tags: transactions.tags })
    .from(transactions)
    .all()) {
    const { entityId } = row;
    if (entityId == null || entityId === '') continue;
    let evidence = byEntity.get(entityId);
    if (!evidence) {
      evidence = { transactionCount: 0, venueCounts: new Map<string, number>(), enrichCount: 0 };
      byEntity.set(entityId, evidence);
    }
    evidence.transactionCount += 1;
    let sawEnrich = false;
    for (const tag of parseTags(row.tags)) {
      if (isVenueTag(tag)) {
        evidence.venueCounts.set(tag, (evidence.venueCounts.get(tag) ?? 0) + 1);
      } else if (tag.startsWith(ENRICH_FACET)) {
        sawEnrich = true;
      }
    }
    if (sawEnrich) evidence.enrichCount += 1;
  }

  return byEntity;
}

/** Coverage of the merchant-level facet across the ledger, for before/after. */
export interface VenueCoverage {
  /** Transactions with an entity and no `enrich:` tag — the addressable set. */
  addressable: number;
  /** How many of those carry a `venue:`. */
  withVenue: number;
  /** Transactions excluded because they are `enrich:`-marked. */
  enrichExcluded: number;
  /** Transactions with no `entity_id` — outside this backfill's reach. */
  withoutEntity: number;
}

/**
 * Measure `venue:` coverage over the ledger. Reported before and after the
 * backfill so the improvement is measured rather than asserted (POPS-2607
 * records the same numbers).
 */
export function measureVenueCoverage(db: FinanceDb): VenueCoverage {
  const coverage: VenueCoverage = {
    addressable: 0,
    withVenue: 0,
    enrichExcluded: 0,
    withoutEntity: 0,
  };
  for (const row of db
    .select({ entityId: transactions.entityId, tags: transactions.tags })
    .from(transactions)
    .all()) {
    const tags = parseTags(row.tags);
    if (tags.some((tag) => tag.startsWith(ENRICH_FACET))) {
      coverage.enrichExcluded += 1;
      continue;
    }
    if (row.entityId == null || row.entityId === '') {
      coverage.withoutEntity += 1;
      continue;
    }
    coverage.addressable += 1;
    if (tags.some(isVenueTag)) coverage.withVenue += 1;
  }
  return coverage;
}

/** One entity's evidence rendered for an operator: `"12 txn, venue:bar×9 venue:cafe×1"`. */
export function describeCounts(evidence: EntityVenueEvidence): string {
  const venues = [...evidence.venueCounts.entries()]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([venue, count]) => `${venue}×${count}`)
    .join(' ');
  return `${evidence.transactionCount} txn${venues === '' ? '' : `, ${venues}`}`;
}
