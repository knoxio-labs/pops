/**
 * Deterministic `type` derivation from a statement descriptor (POPS-2610).
 *
 * A fee is not a purchase, and neither is a gift card, but both used to be
 * stored as one and separated — if at all — by a tag. That put them in the same
 * namespace as things that were actually bought, so every "what did I spend on
 * X" answer either included them or had to remember to exclude them, and the
 * one row nobody tagged (`CHARGE FOR OVERDUE PAYMENT`, untagged) was invisible
 * to a fee report by construction.
 *
 * The split is two axes:
 *  - `type` answers "is this spend at all" — set here, from the descriptor,
 *    with no dependence on anyone having tagged the row;
 *  - the `fee:` tag namespace answers "which fee" — a descriptor, not a filter.
 *
 * Dependency-free and browser-safe (it only reaches
 * {@link normalizeDescription}), so the import review UI and the pillar apply
 * the same rules.
 */
import { normalizeDescription, patternMatchesNormalizedDescription } from './pattern-match.js';

import type { TransactionType } from './corrections-constants.js';

/** The closed `fee:` namespace — the sub-kind of a `type = 'fee'` row. */
export const FEE_TAGS = [
  'fee:interest',
  'fee:late',
  'fee:membership',
  'fee:conversion',
  'fee:atm',
  'fee:surcharge',
] as const;

export type FeeTag = (typeof FEE_TAGS)[number];

/** The `fee:` prefix, so callers can strip foreign fee values without re-deriving it. */
export const FEE_TAG_PREFIX = 'fee:';

/**
 * A gift card converts money into a different spendable form; the purchase and
 * the later spend are the same dollars, so booking both as spend double-counts.
 * The tag stays as the descriptor — it is the `type` that excludes the row.
 */
export const GIFT_CARD_TAG = 'contains:gift-card';

/**
 * Descriptor patterns per fee kind, matched as `contains` against a normalised
 * description (uppercased, digits stripped — see {@link normalizeDescription}).
 *
 * Every pattern is a multi-word phrase on purpose: a bare `FEE` would classify
 * a coffee at "Fee Street Cafe" as an interest charge. Ordered most-specific
 * first, because a descriptor may satisfy two kinds (`CASH ADVANCE FEE` is an
 * ATM fee, `CASH ADVANCE INTEREST` is interest) and the first hit wins.
 *
 * Exported so the backfill migration's test can derive its descriptors from the
 * table itself rather than from a hand-copied list that silently stops covering
 * it (`db/__tests__/fee-transfer-type-migration.test.ts`).
 */
export const FEE_PATTERNS: ReadonlyArray<{ tag: FeeTag; patterns: readonly string[] }> = [
  {
    tag: 'fee:interest',
    patterns: [
      'INTEREST CHARGE',
      'PURCHASE INTEREST',
      'CASH ADVANCE INTEREST',
      'BALANCE TRANSFER INTEREST',
    ],
  },
  {
    tag: 'fee:late',
    patterns: [
      'CHARGE FOR OVERDUE PAYMENT',
      'OVERDUE PAYMENT FEE',
      'LATE PAYMENT FEE',
      'LATE FEE',
      'MISSED PAYMENT FEE',
      'PAYMENT DISHONOUR FEE',
      'DISHONOUR FEE',
    ],
  },
  {
    tag: 'fee:conversion',
    patterns: [
      'FOREIGN CURRENCY CONVERSION FEE',
      'CURRENCY CONVERSION FEE',
      'INTERNATIONAL TRANSACTION FEE',
      'OVERSEAS TRANSACTION FEE',
      'FOREIGN TRANSACTION FEE',
    ],
  },
  {
    tag: 'fee:atm',
    patterns: ['ATM WITHDRAWAL FEE', 'ATM OPERATOR FEE', 'ATM FEE', 'CASH ADVANCE FEE'],
  },
  {
    tag: 'fee:membership',
    patterns: [
      'MEMBERSHIP FEE',
      'ANNUAL MEMBERSHIP',
      'ANNUAL FEE',
      'CARD FEE',
      'MONTHLY ACCOUNT FEE',
      'ACCOUNT SERVICE FEE',
    ],
  },
  {
    tag: 'fee:surcharge',
    patterns: ['CARD SURCHARGE', 'PAYMENT SURCHARGE', 'SURCHARGE FEE'],
  },
];

/**
 * Descriptors for money arriving to settle a card or account — a payment from
 * another account of the user's own, which is a `transfer` in both directions
 * and never spend. Before POPS-2610 these landed as `purchase` with a positive
 * amount, which no spend query handles correctly.
 *
 * Exported for the same reason as {@link FEE_PATTERNS}.
 */
export const INBOUND_TRANSFER_PATTERNS = [
  'PAYMENT RECEIVED',
  'PAYMENT THANK YOU',
  'THANK YOU FOR YOUR PAYMENT',
  'DIRECT DEBIT RECEIVED',
] as const;

/** A `type` derived from the descriptor alone, with the descriptor that produced it. */
export interface DerivedClassification {
  type: TransactionType;
  /** The single `fee:` value for a fee row; absent for every other type. */
  tag?: FeeTag;
  /** The descriptor phrase that matched — carried as the suggestion's provenance. */
  pattern: string;
}

/**
 * Derive a transaction's `type` from its description alone, or `null` when the
 * description says nothing (the overwhelmingly common case — an ordinary
 * merchant charge, which the entity matcher classifies instead).
 *
 * Deterministic and tag-independent by design: this is what makes an untagged
 * `CHARGE FOR OVERDUE PAYMENT` show up in a fee report.
 */
export function classifyFromDescription(description: string): DerivedClassification | null {
  const normalized = normalizeDescription(description);
  if (normalized.length === 0) return null;

  for (const { tag, patterns } of FEE_PATTERNS) {
    const hit = patterns.find((p) =>
      patternMatchesNormalizedDescription(p, 'contains', normalized)
    );
    if (hit) return { type: 'fee', tag, pattern: hit };
  }

  const inbound = INBOUND_TRANSFER_PATTERNS.find((p) =>
    patternMatchesNormalizedDescription(p, 'contains', normalized)
  );
  if (inbound) return { type: 'transfer', pattern: inbound };

  return null;
}

/** Whether `tags` marks the row as a gift-card purchase. */
export function hasGiftCardTag(tags: readonly string[]): boolean {
  return tags.includes(GIFT_CARD_TAG);
}

/**
 * The `type` a row must be committed with, given the type its classification
 * produced and the tags it ends up carrying.
 *
 * A gift-card `purchase` is a `transfer`: the money is not spent until the card
 * is. Only `purchase` is rewritten — a gift-card `refund` or `income` row means
 * something else and is left as authored.
 */
export function resolveCommittedType(
  type: TransactionType,
  tags: readonly string[]
): TransactionType {
  return type === 'purchase' && hasGiftCardTag(tags) ? 'transfer' : type;
}
