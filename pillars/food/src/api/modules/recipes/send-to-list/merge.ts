/**
 * Per-item merge / insert for the send loop, over the lists REST API.
 *
 * Mergeable (ingredient/variant) items go through `upsert-by-ref` with
 * `onConflict='merge-additive'` — the lists pillar atomically sums qty and
 * bounds note growth; food uses the returned quantity to rebuild the label.
 * Unconverted ("free") lines always insert fresh because they have no ref.
 */
import { type ListsClient } from './lists-client.js';
import { relabelAfterMerge, type SendItem } from './send-items.js';

/** Result of writing one recipe line to a shopping list. */
export interface MergeOutcome {
  kind: 'merged' | 'inserted';
}

/** Upserts one send item and repairs its label from the cumulative quantity after a merge. */
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
      notesMerge: { separator: '; ', maxLength: 500 },
    });
    if (res.outcome === 'merged') {
      if (res.qty !== null) {
        await client.updateItem(res.itemId, { label: relabelAfterMerge(item, res.qty) });
      }
      return { kind: 'merged' };
    }
    return { kind: 'inserted' };
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

/**
 * `<recipe title>` or `<recipe title> (<prep>)` — short note fragment
 * recorded against each list item so the "already sent" search can find it.
 */
function buildNoteFragment(recipeTitle: string, prepLabel: string | null): string {
  if (prepLabel === null || prepLabel === '') return recipeTitle;
  return `${recipeTitle} (${prepLabel})`;
}
