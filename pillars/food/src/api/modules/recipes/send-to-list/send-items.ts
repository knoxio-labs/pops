import { buildCanonicalItem, buildUnconvertedItem } from './label.js';

/**
 * Bridges the aggregate output into the row-shaped `SendItem` structures the
 * send loop iterates over. Carries ingredient + variant names alongside the
 * preview so the merge step can supply the lists pillar with an item-specific
 * suffix for the cumulative-quantity label without re-querying.
 */
import type { AggregateResult, UnconvertedAggregate } from './aggregate.js';
import type { AggregatedCanonical, PreviewItem } from './types.js';

export type SendItemRefKind = 'ingredient' | 'variant' | 'free';

export interface SendItem {
  preview: PreviewItem;
  refKind: SendItemRefKind;
  /** Null when `refKind='free'`. */
  refId: number | null;
  /** Ingredient name used to format the merged label. */
  ingredientName: string;
  /** Variant name used to format the merged label. May be null. */
  variantName: string | null;
  /** Joined prep-state label (e.g. "diced, sliced") for the merged label. */
  prepLabel: string | null;
  /** Canonical items can merge; unconverted lines always insert fresh. */
  mergeable: boolean;
}

export function buildSendItems(agg: AggregateResult): SendItem[] {
  return [...agg.canonical.map(canonicalToSendItem), ...agg.unconverted.map(unconvertedToSendItem)];
}

function canonicalToSendItem(agg: AggregatedCanonical): SendItem {
  return {
    preview: buildCanonicalItem(agg),
    refKind: agg.variantId === null ? 'ingredient' : 'variant',
    refId: agg.variantId ?? agg.ingredientId,
    ingredientName: agg.ingredientName,
    variantName: agg.variantName,
    prepLabel: agg.prepSlugs.size === 0 ? null : [...agg.prepSlugs].toSorted().join(', '),
    mergeable: true,
  };
}

function unconvertedToSendItem(row: UnconvertedAggregate): SendItem {
  return {
    preview: buildUnconvertedItem(row),
    // Unconverted lines never merge — keep refKind='free' so a later
    // canonical send for the same ingredient (different unit) doesn't
    // collide with the raw line.
    refKind: 'free',
    refId: null,
    ingredientName: row.ingredientName,
    variantName: row.variantName,
    prepLabel: row.prepStateName,
    mergeable: false,
  };
}
