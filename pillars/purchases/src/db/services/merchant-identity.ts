/**
 * Who an order's money went to, and how confidently that is known.
 *
 * Shared by every aggregate that attributes spend, because a second copy of
 * this rule is a second answer to "is a matching label the same merchant" —
 * and the two would disagree the first time one of them was corrected.
 */
import { isNewer, orderRank, type OrderRank } from './order-rank.js';
import { tupleKey } from './tuple-key.js';

/**
 * Who the spend is attributed to, and how confidently.
 *
 * Three-way because the pillar has two different things called a merchant
 * and they are not interchangeable. `merchantEntityId` is operative — a
 * resolved `contacts` entity. `merchantEntityName` is only a label, and no
 * export adapter sets an id at all, so today an Amazon roll-up is grouped on
 * the string `Amazon`. Presenting that as the same kind of fact as a
 * resolved entity would be reporting a string match as an identity: two
 * merchants sharing a label share a row, and renaming one splits its
 * history.
 */
export type MerchantIdentity =
  | {
      readonly resolution: 'entity';
      /** The resolved `contacts` entity. Present, or this is not an entity group. */
      readonly entityId: string;
      /** Its label, which an order carrying the id is not obliged to state. */
      readonly name: string | null;
    }
  | {
      readonly resolution: 'name';
      readonly entityId: null;
      /** The grouping key itself, so never absent. */
      readonly name: string;
    }
  | { readonly resolution: 'unattributed'; readonly entityId: null; readonly name: null };

/**
 * A merchant identity together with the rank of the order whose label it is
 * currently wearing, which is what makes {@link withNewerLabel}
 * deterministic rather than dependent on read order.
 */
export interface LabelledMerchant {
  readonly identity: MerchantIdentity;
  readonly labelRank: OrderRank;
}

/**
 * The bucket an order belongs to, and how that bucket is identified.
 *
 * The key is a tuple rather than a delimited string so a merchant whose
 * *name* happens to equal another merchant's *entity id* cannot land in the
 * same bucket.
 */
export function identifyMerchant(
  entityId: string | null,
  name: string | null
): { key: string; identity: MerchantIdentity } {
  if (entityId !== null) {
    return {
      key: tupleKey('entity', entityId),
      identity: { entityId, name, resolution: 'entity' },
    };
  }
  if (name !== null) {
    return {
      key: tupleKey('name', name),
      identity: { entityId: null, name, resolution: 'name' },
    };
  }
  return {
    key: tupleKey('unattributed', null),
    identity: { entityId: null, name: null, resolution: 'unattributed' },
  };
}

/**
 * Ranks an order's claim to supply a group's label: newest wins, id breaks
 * ties. The instant rather than the timestamp text, so an order stamped in
 * a `+HH:MM` offset does not overtake a later one stamped in `Z`.
 */
export function merchantLabelRank(orderedAt: string, purchaseId: string): OrderRank {
  return orderRank(orderedAt, purchaseId);
}

/** A stable ordering for merchant identities, so equal data always serialises equally. */
export function merchantSortKey(identity: MerchantIdentity): string {
  return tupleKey(identity.name, identity.entityId);
}

/**
 * Take another order's label for an entity group, if that order has one.
 *
 * Only an entity group's label can move: a `name` group is keyed on the label
 * itself and an `unattributed` one has none by definition.
 *
 * Two rules, and the second is the one that is easy to get wrong. The newest
 * order's label wins, deterministically, because an entity-keyed bucket spans
 * orders written either side of a rename in `contacts`. But an order that
 * states *no* label is not a rename to nothing — `merchantEntityId` is
 * operative and `merchantEntityName` is only its label, so a nameless newer
 * order carries no label information and must not erase the one the group
 * has. For the same reason a group that is still nameless takes the first
 * label it is offered, whatever that order's rank.
 */
export function withNewerLabel(
  current: LabelledMerchant,
  candidate: LabelledMerchant
): LabelledMerchant {
  if (current.identity.resolution !== 'entity' || candidate.identity.name === null) return current;
  if (current.identity.name !== null && !isNewer(candidate.labelRank, current.labelRank)) {
    return current;
  }

  return {
    identity: { ...current.identity, name: candidate.identity.name },
    labelRank: candidate.labelRank,
  };
}
