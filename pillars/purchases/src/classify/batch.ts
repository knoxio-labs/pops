/**
 * Deciding which lines are the same product, so one product is one decision.
 *
 * Amazon spend repeats: 54 ASINs in the reference bundle were bought in more
 * than one order, 12.6% of spend, so keying on the sku means one answer
 * covers every past and future repeat of it.
 *
 * **Keying on `(source, sku)` alone is wrong, and wrong exactly where it
 * costs the most.** `sku` is written at one site in the tree — the Amazon
 * order-history mapper. Woolworths states no identifier and a photographed
 * receipt states less, so every non-Amazon line has `sku IS NULL`; SQL
 * `GROUP BY` folds NULLs into one group, and the pass would collapse ~490
 * grocery lines into a single decision applied to an entire merchant. That
 * decision would be `consumable`, because grocery overwhelmingly is — and it
 * would erase the `Wiltshire Impulse Citrus Juicer` and the
 * `6015322 Barware Set/4`, the ~1% of grocery lines that are durable and
 * precisely what the inventory fan-out exists to catch.
 *
 * So the key falls back through what the source actually states: the sku,
 * then the normalised product name, then the line's own id. The last is a
 * key that groups nothing, which is the correct answer for a line that
 * states nothing to group on.
 */

/** What the pass needs to know about a line to decide how to batch it. */
export interface BatchableItem {
  readonly id: string;
  readonly source: string;
  readonly sku: string | null;
  readonly name: string;
}

/**
 * Product name reduced to what identifies the product.
 *
 * Case and punctuation vary between receipts of the same item;
 * `WW Smky Chip Chdr TstyShrd Cheese 250g` is the same product however the
 * till chose to space it. Digits are kept — `1L` and `2L` are different
 * products, and dropping them would merge them.
 */
export function normalisedName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, ' ')
    .trim();
}

/**
 * The batching key for one line.
 *
 * `source` leads because the same string means different things at
 * different merchants, and a decision about an Amazon ASIN should not
 * silently apply to a Woolworths article number that happens to match.
 *
 * JSON rather than a delimiter, for the reason the Woolworths checksum
 * gives: joining on a separator is not injective, and a merchant is free to
 * print that separator inside a sku. Two different products sharing a key
 * share a verdict, which is the failure this whole module exists to avoid.
 */
export function batchingKey(item: BatchableItem): string {
  const sku = item.sku?.trim() ?? '';
  if (sku !== '') return JSON.stringify([item.source, 'sku', sku]);

  const name = normalisedName(item.name);
  if (name !== '') return JSON.stringify([item.source, 'name', name]);

  // A line with no identifier and no readable name. Keying on its own id
  // groups it with nothing, which costs one extra decision and is the only
  // honest answer — the alternative is a bucket every nameless line falls
  // into and receives one verdict from.
  return JSON.stringify([item.source, 'item', item.id]);
}

/** One product: every line that shares a batching key. */
export interface ProposalCandidate {
  readonly key: string;
  readonly source: string;
  /** The first line's name, which is what the model is shown. */
  readonly name: string;
  readonly sku: string | null;
  /** Every line this one decision will be written to. */
  readonly itemIds: readonly string[];
}

/**
 * Fold lines into candidates, preserving input order.
 *
 * Order matters for resumability: the caller reads lines highest-value
 * first and expects the batches to follow, so a run that is interrupted has
 * spent its budget on the lines worth deciding.
 */
export function toCandidates(items: readonly BatchableItem[]): readonly ProposalCandidate[] {
  const byKey = new Map<string, { candidate: ProposalCandidate; itemIds: string[] }>();
  for (const item of items) {
    const key = batchingKey(item);
    const existing = byKey.get(key);
    if (existing === undefined) {
      const itemIds = [item.id];
      byKey.set(key, {
        candidate: { key, source: item.source, name: item.name, sku: item.sku, itemIds },
        itemIds,
      });
    } else {
      existing.itemIds.push(item.id);
    }
  }
  return [...byKey.values()].map((entry) => entry.candidate);
}

/** Split candidates into fixed-size batches, in order. */
export function intoBatches<T>(candidates: readonly T[], size: number): readonly (readonly T[])[] {
  if (size < 1) throw new Error(`batch size must be at least 1, got ${String(size)}`);
  const batches: T[][] = [];
  for (let i = 0; i < candidates.length; i += size) {
    batches.push([...candidates.slice(i, i + size)]);
  }
  return batches;
}
