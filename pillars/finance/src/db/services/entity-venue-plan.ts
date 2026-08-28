/**
 * The plan shapes shared by the `venue:` default-tag backfill's two halves
 * (POPS-2609): `entity-venue-decision.ts` decides one contact, and
 * `entity-venue-defaults.ts` sweeps the live set. They live here so neither
 * half imports the other.
 */
/** The minimum shape of a live contact needed to plan its defaults. */
export interface LiveEntityDefaults {
  id: string;
  name: string;
  defaultTags: string[];
}

/** A human's venue call for an entity the ledger could not resolve on its own. */
export interface EntityVenueOverride {
  entityId: string;
  entityName: string;
  venue: string;
  /** Set when the override contradicts something the ledger says. */
  note?: string;
}

/** A `defaultTags` rewrite the plan is confident enough to apply unreviewed. */
export interface EntityDefaultTagsWrite {
  entityId: string;
  entityName: string;
  before: string[];
  after: string[];
  /** The venue this write adds, when it adds one. */
  venueAdded?: string;
  /**
   * Defaults this write removes. `venue:` is the ONLY merchant-level facet in
   * the taxonomy, so everything else on a contact is either a per-transaction
   * facet (`occasion:`/`contains:`, which vary per row for one merchant) or a
   * pre-migration flat tag ("Alcohol", "Groceries"), and both are suggested
   * with the entity badge on every future import until removed.
   */
  removed: string[];
}

/** Why an entity was left for a human instead of written. */
export type EntityVenueReviewReason =
  /** `enrich:`-marked merchant — the venue does not determine the contents. */
  | 'enrich-excluded'
  /** No transaction of this entity asserts a `venue:` — needs a human call. */
  | 'no-evidence'
  /** Two or more venues tie on the ledger. */
  | 'ambiguous'
  /** The stored default disagrees with the ledger, or there is more than one. */
  | 'venue-conflict';

/** An entity the plan deliberately does not resolve on its own. */
export interface EntityVenueReview {
  entityId: string;
  entityName: string;
  reason: EntityVenueReviewReason;
  /** Human-readable evidence for the reason (counts, candidates, stored value). */
  detail: string;
}

/**
 * The reviewed backfill plan: the writes that are safe to apply as-is, and
 * everything that is not, split by why.
 */
export interface EntityVenueDefaultsPlan {
  writes: EntityDefaultTagsWrite[];
  review: EntityVenueReview[];
  /** Entities whose venue came from the reviewed override list, not the ledger. */
  overridden: EntityVenueOverride[];
  /** Override keys matching no live contact — a typo in the review file. */
  unknownOverrides: string[];
  /** Contacts already carrying exactly the venue the ledger implies. */
  alreadyCorrect: string[];
  /** Live contacts with no transaction at all — nothing to derive from. */
  withoutTransactions: number;
}
