/**
 * Who an order's money went to, and how confidently that is known.
 *
 * Shared by every aggregate that attributes spend, because a second copy of
 * this rule is a second answer to "is a matching label the same merchant" —
 * and the two would disagree the first time one of them was corrected.
 */
import { eq, sql } from 'drizzle-orm';

import { isNewer, orderRank, type OrderRank } from './order-rank.js';
import { tupleKey } from './tuple-key.js';

import type { SQL } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

/**
 * The characters that count as padding on a merchant label, in the one
 * spelling {@link normalizeMerchantLabel} (TS) and every SQL predicate below
 * both trim by. A second spelling of "padding" is how the two sides would
 * end up disagreeing about a label neither of them was written against.
 *
 * JS `.trim()` strips a much wider Unicode whitespace set than this, and
 * SQLite's two-argument `trim(X, Y)` strips only the code points literally
 * in `Y` — so the set has to be chosen, not assumed. Space, tab, LF, CR and
 * NBSP (U+00A0) are here because `trim(X, Y)` was checked against a real
 * SQLite connection and strips each of them exactly the way `.trim()` does,
 * NBSP included even though it is a multi-byte UTF-8 character (see
 * `merchant-identity.sqlite.test.ts`). Anything wider that JS `.trim()`
 * treats as whitespace (e.g. U+2028, U+FEFF) is deliberately left out of
 * *both* sides rather than trimmed on one and not the other.
 */
export const MERCHANT_LABEL_PADDING = ' \t\n\r\u00a0';

function escapeForCharClass(char: string): string {
  return char.replace(/[\\\]^-]/g, '\\$&');
}

const PADDING_CLASS = [...MERCHANT_LABEL_PADDING].map(escapeForCharClass).join('');
const PADDING_PATTERN = new RegExp(`^[${PADDING_CLASS}]+|[${PADDING_CLASS}]+$`, 'gu');

/** Strip {@link MERCHANT_LABEL_PADDING} from both ends — nothing wider. */
export function trimMerchantLabel(value: string): string {
  return value.replace(PADDING_PATTERN, '');
}

/**
 * A stored label with no usable content — `null`, `''`, or padding only —
 * is the same fact as no label at all, so every reader of `merchantEntityName`
 * folds it through here rather than checking `!== null` on its own. Write
 * normalisation, {@link identifyMerchant} and the unattributed filter's SQL
 * ({@link blankMerchantLabel}) are the three readers; this is the one
 * spelling of "usable" they all defer to.
 *
 * Trims rather than only blanking, so `"Amazon "` and `"Amazon"` cannot land
 * in different groups depending on which adapter happened to pad the label —
 * every reader compares the trimmed value, so a trim anywhere but here would
 * still let readers drift from each other.
 */
export function normalizeMerchantLabel(name: string | null | undefined): string | null {
  if (name === undefined || name === null) return null;
  const trimmed = trimMerchantLabel(name);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * SQL equivalent of `normalizeMerchantLabel(column) === null`, for the
 * unattributed bucket's filter — a stored empty or padding-only label has
 * to open the same bucket a `null` one does, or the fold on the read side has
 * a group the filter still cannot name.
 */
export function blankMerchantLabel(column: AnySQLiteColumn): SQL {
  return sql`(${column} is null or trim(${column}, ${MERCHANT_LABEL_PADDING}) = '')`;
}

/**
 * SQL equivalent of `normalizeMerchantLabel(column)`, for a name filter that
 * has to match a legacy row's padding-and-all label as the trimmed value
 * that row displays and rolls up under, not the raw column (POPS-2342).
 * `trim(NULL, chars)` is `NULL` in SQLite, so a `null` column falls out of
 * an equality against a non-null trimmed value on its own — no extra
 * `isNull`/`isNotNull` needed here.
 */
export function trimmedMerchantLabelSql(column: AnySQLiteColumn): SQL {
  return sql`trim(${column}, ${MERCHANT_LABEL_PADDING})`;
}

/**
 * The predicate for a `name` group's label, matched the way the roll-up and
 * the display both read it: trimmed, not verbatim.
 *
 * A legacy row stored as `'Amazon '` rolls up and displays under `Amazon`
 * (`identifyMerchant` already normalises), so a filter that compared the raw
 * column would return zero rows for the very group it is meant to open
 * (POPS-2342) — the same unopenable-group failure {@link blankMerchantLabel}
 * was written for, here for a non-blank padded label.
 *
 * A `name` filter's value cannot itself normalise to blank in ordinary use —
 * the wire schema requires a non-empty string — but a padding-only value is
 * technically legal, and trimming it to `null` would leave nothing to `eq`
 * against. That case falls back to the pre-fix, verbatim comparison rather
 * than being reinterpreted as a request for the unattributed bucket, which
 * would be a different filter than the one named.
 */
export function nameLabelCondition(column: AnySQLiteColumn, name: string): SQL {
  const normalized = normalizeMerchantLabel(name);
  return normalized === null ? eq(column, name) : eq(trimmedMerchantLabelSql(column), normalized);
}

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
  rawName: string | null
): { key: string; identity: MerchantIdentity } {
  const name = normalizeMerchantLabel(rawName);
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
