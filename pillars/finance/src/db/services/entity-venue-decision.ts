/**
 * The per-entity decision rules behind the `venue:` default-tag backfill
 * (POPS-2609): what the ledger's evidence justifies writing onto one contact,
 * and what it does not. `entity-venue-defaults.ts` owns the plan shape and the
 * sweep over the live contact set; this module decides a single entity.
 */
import {
  describeCounts,
  ENRICH_FACET,
  isVenueTag,
  type EntityVenueEvidence,
} from './entity-venue-facets.js';

import type {
  EntityVenueDefaultsPlan,
  EntityVenueReviewReason,
  LiveEntityDefaults,
} from './entity-venue-defaults.js';

/** The single best-supported venue for an entity, or why there isn't one. */
type VenueVerdict =
  | { kind: 'proposed'; venue: string; support: number }
  | { kind: 'no-evidence' }
  | { kind: 'ambiguous'; candidates: string[]; support: number };

function pickVenue(venueCounts: ReadonlyMap<string, number>): VenueVerdict {
  if (venueCounts.size === 0) return { kind: 'no-evidence' };
  let top = 0;
  for (const count of venueCounts.values()) top = Math.max(top, count);
  const candidates = [...venueCounts.entries()]
    .filter(([, count]) => count === top)
    .map(([venue]) => venue)
    .toSorted();
  const [only] = candidates;
  if (candidates.length > 1 || only === undefined) {
    return { kind: 'ambiguous', candidates, support: top };
  }
  return { kind: 'proposed', venue: only, support: top };
}

/** The evidence a contact with no transaction at all presents. */
export const NO_EVIDENCE: EntityVenueEvidence = {
  transactionCount: 0,
  venueCounts: new Map(),
  enrichCount: 0,
};

export interface PlanOneArgs {
  entity: LiveEntityDefaults;
  evidence: EntityVenueEvidence;
  override: string | undefined;
  plan: EntityVenueDefaultsPlan;
}

/**
 * A reviewed override is a human's call and outranks every heuristic: it
 * replaces whatever venue the contact carries and applies even to an `enrich:`
 * merchant. The disagreements it papers over are recorded on `overridden`
 * rather than swallowed, so the plan still shows what the ledger thought.
 */
function planOverride(args: PlanOneArgs, venue: string, stripped: string[]): string[] {
  const { entity, evidence, plan } = args;
  const notes: string[] = [];
  if (evidence.enrichCount > 0) {
    notes.push(
      `overrides the ${ENRICH_FACET} exclusion ` +
        `(${evidence.enrichCount}/${evidence.transactionCount} txn)`
    );
  }
  const disagreeing = stripped.filter((tag) => isVenueTag(tag) && tag !== venue);
  if (disagreeing.length > 0) notes.push(`replaces stored ${disagreeing.join(', ')}`);
  const ledger = pickVenue(evidence.venueCounts);
  if (ledger.kind === 'proposed' && ledger.venue !== venue) {
    notes.push(`the ledger says ${ledger.venue} (${describeCounts(evidence)})`);
  }
  plan.overridden.push({
    entityId: entity.id,
    entityName: entity.name,
    venue,
    ...(notes.length === 0 ? {} : { note: notes.join('; ') }),
  });
  return [...stripped.filter((tag) => !isVenueTag(tag)), venue];
}

/** The derived (non-override) venue decision: the tag to add, or a review entry. */
function planDerivedVenue(args: PlanOneArgs, storedVenue: string | undefined): string | undefined {
  const { entity, evidence, plan } = args;
  const review = (reason: EntityVenueReviewReason, detail: string): void => {
    plan.review.push({ entityId: entity.id, entityName: entity.name, reason, detail });
  };

  if (evidence.enrichCount > 0) {
    review(
      'enrich-excluded',
      `${evidence.enrichCount}/${evidence.transactionCount} txn carry ${ENRICH_FACET}` +
        (storedVenue === undefined ? '' : ` — but contact defaults ${storedVenue}`)
    );
    return undefined;
  }

  const verdict = pickVenue(evidence.venueCounts);
  if (verdict.kind === 'ambiguous') {
    review(
      'ambiguous',
      `${verdict.candidates.join(' / ')} tie at ${verdict.support} (${describeCounts(evidence)})`
    );
    return undefined;
  }
  if (verdict.kind === 'no-evidence') {
    if (storedVenue === undefined) review('no-evidence', describeCounts(evidence));
    return undefined;
  }
  if (storedVenue === undefined) return verdict.venue;
  if (storedVenue === verdict.venue) {
    plan.alreadyCorrect.push(entity.id);
    return undefined;
  }
  review(
    'venue-conflict',
    `contact defaults ${storedVenue} but the ledger says ${verdict.venue} ` +
      `(${describeCounts(evidence)})`
  );
  return undefined;
}

/** Decide one contact's `defaultTags`, recording the outcome on `plan`. */
export function planOneEntity(args: PlanOneArgs): void {
  const { entity, override, plan } = args;
  const stripped = entity.defaultTags.filter(isVenueTag);
  const removed = entity.defaultTags.filter((tag) => !isVenueTag(tag));
  const storedVenues = stripped;

  let after = stripped;
  let venueAdded: string | undefined;

  if (override !== undefined) {
    after = planOverride(args, override, stripped);
    if (!storedVenues.includes(override)) venueAdded = override;
  } else if (storedVenues.length > 1) {
    plan.review.push({
      entityId: entity.id,
      entityName: entity.name,
      reason: 'venue-conflict',
      detail: `contact carries ${storedVenues.length} venues: ${storedVenues.join(', ')}`,
    });
  } else {
    venueAdded = planDerivedVenue(args, storedVenues[0]);
    if (venueAdded !== undefined) after = [...stripped, venueAdded];
  }

  const unchanged =
    after.length === entity.defaultTags.length &&
    after.every((tag, i) => tag === entity.defaultTags[i]);
  if (unchanged) return;

  plan.writes.push({
    entityId: entity.id,
    entityName: entity.name,
    before: entity.defaultTags,
    after,
    ...(venueAdded === undefined ? {} : { venueAdded }),
    removed,
  });
}
