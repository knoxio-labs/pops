/**
 * Planning for the entity `venue:` default-tag backfill (POPS-2609).
 *
 * `venue:` answers "what kind of place is this", which is a fact about the
 * MERCHANT, not about any one transaction — Stonewall is always a bar. The
 * tag-suggester already has the mechanism (pass 4 reads the contact's
 * `defaultTags`); this service derives what those defaults should be from the
 * evidence already sitting on the ledger, so the value is set once per
 * merchant instead of re-decided per row.
 *
 * Contacts owns `defaultTags`; finance owns the transactions the evidence is
 * read from. This service therefore takes the LIVE contact set as an argument
 * and returns a plan — it never writes. The reviewed script
 * (`scripts/backfill-entity-venue-tags.ts`) prints the plan and applies the
 * writes through the contacts pillar.
 *
 * Two deliberate exclusions, both from the ticket:
 *
 *  - `enrich:` merchants (Amazon, Bunnings, IKEA …) are marked content-unknown
 *    precisely because the venue does not determine what was bought, so a
 *    `venue:` on them would be misleading. Any transaction carrying an
 *    `enrich:` tag disqualifies its entity — deliberately conservative, and
 *    the entity is reported so a human can override rather than silently
 *    dropped.
 *  - Anything that is not a `venue:` tag is stripped from `defaultTags`.
 *    `occasion:` and `contains:` genuinely vary per transaction for the same
 *    merchant, and the pre-migration flat tags ("Alcohol", "Groceries") are
 *    dead vocabulary; both were being suggested with the entity badge on every
 *    import. Unlike a venue call, REMOVING one needs no human judgement — it
 *    is categorically wrong on a contact — so the plan strips it.
 */
import { NO_EVIDENCE, planOneEntity } from './entity-venue-decision.js';
import { collectEntityVenueEvidence, isVenueTag, VENUE_FACET } from './entity-venue-facets.js';

import type { EntityVenueDefaultsPlan, LiveEntityDefaults } from './entity-venue-plan.js';
import type { FinanceDb } from './internal.js';

export type {
  EntityDefaultTagsWrite,
  EntityVenueDefaultsPlan,
  EntityVenueOverride,
  EntityVenueReview,
  EntityVenueReviewReason,
  LiveEntityDefaults,
} from './entity-venue-plan.js';

export {
  collectEntityVenueEvidence,
  ENRICH_FACET,
  isPerTransactionFacet,
  measureVenueCoverage,
  PER_TRANSACTION_FACETS,
  VENUE_FACET,
  type EntityVenueEvidence,
  type VenueCoverage,
} from './entity-venue-facets.js';

/**
 * Derive the `defaultTags` rewrite for every live contact from the venue tags
 * its transactions already carry, plus the reviewed human calls in `overrides`
 * (`contactId → venue:x`).
 *
 * A derived write is emitted only when it is deterministic: adding the single
 * best-supported `venue:` to a contact that has none, and/or removing an
 * `occasion:`/`contains:` default that should never have been there. Ties,
 * missing evidence, `enrich:` merchants and disagreements with a stored value
 * land in `review` untouched — they are the human calls the ticket reserves,
 * and an override is how that call comes back in.
 */
export function planEntityVenueDefaults(
  db: FinanceDb,
  liveEntities: readonly LiveEntityDefaults[],
  overrides: ReadonlyMap<string, string> = new Map()
): EntityVenueDefaultsPlan {
  for (const [entityId, venue] of overrides) {
    if (!isVenueTag(venue)) {
      throw new Error(
        `override for ${entityId} is "${venue}" — every override must be a ${VENUE_FACET} tag`
      );
    }
  }
  const evidenceByEntity = collectEntityVenueEvidence(db);
  const liveIds = new Set(liveEntities.map((e) => e.id));
  const plan: EntityVenueDefaultsPlan = {
    writes: [],
    review: [],
    overridden: [],
    unknownOverrides: [...overrides.keys()].filter((id) => !liveIds.has(id)),
    alreadyCorrect: [],
    withoutTransactions: 0,
  };

  for (const entity of liveEntities) {
    const evidence = evidenceByEntity.get(entity.id);
    if (!evidence) plan.withoutTransactions += 1;
    planOneEntity({
      entity,
      evidence: evidence ?? NO_EVIDENCE,
      override: overrides.get(entity.id),
      plan,
    });
  }

  return plan;
}
