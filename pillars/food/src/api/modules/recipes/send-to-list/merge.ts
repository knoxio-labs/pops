/**
 * Per-item merge / insert for the send loop, over the lists REST API.
 *
 * Mergeable (ingredient/variant) items go through `upsert-by-ref` with
 * `onConflict='merge-additive'` — the lists pillar atomically sums qty,
 * rebuilds the label, and bounds note growth.
 * Unconverted ("free") lines always insert fresh because they have no ref.
 */
import { composeLabel } from './compose-label.js';
import { type ListsClient } from './lists-client.js';
import { type SendItem } from './send-items.js';

/** Result of writing one recipe line to a shopping list. */
export interface MergeOutcome {
  kind: 'merged' | 'inserted';
}

/** Upserts one send item, with merged labels rebuilt in the lists transaction. */
export async function processItem(
  client: ListsClient,
  listId: number,
  item: SendItem,
  recipeTitle: string
): Promise<MergeOutcome> {
  const notes = buildNoteFragment(recipeTitle, item.prepLabel);
  if (item.mergeable && item.refId !== null && item.refKind !== 'free') {
    const res = await client.upsertByRef(listId, {
      refKind: item.refKind,
      refId: item.refId,
      label: item.preview.label,
      qty: item.preview.qty,
      unit: item.preview.unit,
      notes,
      onConflict: 'merge-additive',
      labelFromQty: quantityLabel(item),
      notesMerge: { separator: '; ', maxLength: 500 },
    });
    return { kind: res.outcome === 'merged' ? 'merged' : 'inserted' };
  }
  await client.addItem(listId, {
    label: item.preview.label,
    qty: item.preview.qty,
    unit: item.preview.unit,
    refKind: 'free',
    refId: null,
    notes,
  });
  return { kind: 'inserted' };
}

function quantityLabel(item: SendItem): {
  prefix: string;
  suffix: string;
  maxFractionDigits: number;
} {
  const suffix = composeLabel({
    qty: '',
    unit: item.preview.unit ?? '',
    ingredientName: item.ingredientName,
    variantName: item.variantName,
    prepLabel: item.prepLabel,
  });
  return { prefix: '', suffix: ` ${suffix}`, maxFractionDigits: 2 };
}

/**
 * `<recipe title>` or `<recipe title> (<prep>)` — short note fragment
 * recorded against each list item so the "already sent" search can find it.
 */
function buildNoteFragment(recipeTitle: string, prepLabel: string | null): string {
  if (prepLabel === null || prepLabel === '') return recipeTitle;
  return `${recipeTitle} (${prepLabel})`;
}
