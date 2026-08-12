/**
 * Confirming a line's classification — the pillar's first item-level write
 * after ingest.
 *
 * Everything here is a human's answer, so everything here writes a
 * confirmation. That is the whole distinction the two columns exist to
 * carry: a classification pass proposes and leaves `confirmedAt` null, and
 * this path asserts and sets it, after which no pass may reconsider the row.
 *
 * One transaction per call. Tags are replaced rather than merged, so a
 * half-applied change would leave a line with some of its old tags and some
 * of its new ones and no way to tell which.
 */
import { and, eq } from 'drizzle-orm';

import { isItemTag } from '../../contract/constants.js';
import { InvalidIngestPayloadError } from '../errors.js';
import { purchaseItems, purchaseItemTags } from '../schema.js';
import { nowIso, type PurchasesDb } from './internal.js';
import { selectItemDetails } from './purchase-reads.js';

import type { ItemKind } from '../../contract/constants.js';
import type { PurchaseItemDetail } from './purchase-reads.js';

export interface ConfirmItemInput {
  /**
   * Absent leaves the kind alone. Explicit null retracts a wrong
   * confirmation to unclassified — back to a proposal pass's work set —
   * rather than to a different wrong answer.
   */
  readonly kind?: ItemKind | null;
  /** Absent leaves tags alone. Present replaces them outright. */
  readonly tags?: readonly string[];
}

/**
 * Apply a human's classification to one line, and read it back.
 *
 * Returns undefined when the line does not exist *on that order*. The
 * two-part key is not decoration: item ids are random UUIDs, so a caller
 * holding one but not its order is guessing, and answering that guess would
 * let a mistyped order id silently mutate someone else's line.
 */
export function confirmItemClassification(
  db: PurchasesDb,
  purchaseId: string,
  itemId: string,
  input: ConfirmItemInput
): PurchaseItemDetail | undefined {
  if (input.kind === undefined && input.tags === undefined) {
    throw new InvalidIngestPayloadError('a confirmation must state a kind, tags, or both');
  }
  for (const tag of input.tags ?? []) {
    if (!isItemTag(tag)) {
      throw new InvalidIngestPayloadError(
        `item tag '${tag}' is not a lower-case slug; purchases' item vocabulary is open but its shape is not`
      );
    }
  }

  const now = nowIso();
  const applied = db.transaction((tx) => {
    const belongs =
      tx
        .select({ id: purchaseItems.id })
        .from(purchaseItems)
        .where(and(eq(purchaseItems.id, itemId), eq(purchaseItems.purchaseId, purchaseId)))
        .all().length > 0;
    if (!belongs) return false;

    if (input.kind !== undefined) {
      tx.update(purchaseItems)
        .set({
          kind: input.kind,
          // Cleared together with the value, because the CHECK forbids a
          // confirmation with nothing under it and because a "confirmed
          // unknown" would be a third state every consumer has to handle.
          kindConfirmedAt: input.kind === null ? null : now,
        })
        .where(eq(purchaseItems.id, itemId))
        .run();
    }

    if (input.tags !== undefined) {
      // Replace, not merge: the set a person states is the set, and a tag
      // they left out is one they rejected. Merging would make a proposal
      // impossible to decline.
      tx.delete(purchaseItemTags).where(eq(purchaseItemTags.itemId, itemId)).run();
      for (const tag of new Set(input.tags)) {
        tx.insert(purchaseItemTags).values({ itemId, tag, createdAt: now, confirmedAt: now }).run();
      }
    }
    return true;
  });

  if (!applied) return undefined;
  return selectItemDetails(db, purchaseId).find((detail) => detail.item.id === itemId);
}
