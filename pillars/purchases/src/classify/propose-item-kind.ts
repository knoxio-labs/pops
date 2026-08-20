/**
 * The item-kind proposal pass.
 *
 * A separate, resumable sweep — **never part of an adapter**. Ingest must
 * keep working with no API key and no network, both offline backfill
 * scripts depend on that, and coupling a 943-line import to a model call
 * would re-charge for the same answer on every re-ingest.
 *
 * Three rules make a proposal safe rather than a guess with extra steps:
 *
 * - **It only ever fills a NULL.** A line that already has a kind was
 *   either asserted by a human or transcribed from a source that stated it,
 *   and both outrank a proposal. The schema's CHECK means `kind IS NULL`
 *   already implies no confirmation, but the write says both, so the pass
 *   stays correct if that constraint is ever relaxed.
 * - **It can decline.** `unknown` comes back as no entry at all and the row
 *   stays NULL, which is what the column is designed around.
 * - **It is resumable.** Work is selected by `kind IS NULL` and committed
 *   per batch, so an interrupted run resumes by re-reading the same
 *   predicate rather than from a cursor nothing maintains.
 *
 * Re-proposing after a better model means clearing proposals first —
 * `UPDATE purchase_items SET kind = NULL WHERE kind_confirmed_at IS NULL`,
 * which by construction cannot touch a decision. That is a deliberate
 * separate step rather than a flag on this one: a pass that could overwrite
 * an existing kind is one bug away from overwriting a confirmed one.
 */
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import { purchaseItems, purchases } from '../db/schema.js';
import { loadProductDictionary } from '../db/services/product-dictionary.js';
import { intoBatches, toCandidates, type ProposalCandidate } from './batch.js';
import { readKindProposals } from './kind-proposal.js';

import type { ItemKind } from '../contract/constants.js';
import type { PurchasesDb } from '../db/services/internal.js';
import type { BatchableItem } from './batch.js';

/**
 * Asking a model what a batch of line items are.
 *
 * A port, so the pass runs on a real client in production and on canned
 * answers in tests — a test that costs money and needs a network is a test
 * that gets skipped. Returns the model's raw text; reading it is
 * {@link readKindProposals}, which is pure.
 */
export interface ItemKindProposer {
  propose(candidates: readonly ProposalCandidate[]): Promise<string | null>;
}

export interface ProposeItemKindsOptions {
  /** Products per model call. */
  readonly batchSize?: number;
  /** Stop after this many products. Absent means every unclassified line. */
  readonly limit?: number;
  /** Called after each batch commits, so a long run can report progress. */
  readonly onBatch?: (done: number, total: number) => void;
}

export interface ProposeItemKindsOutcome {
  /** Distinct products found unclassified. */
  readonly candidates: number;
  readonly batches: number;
  /** Lines written. Higher than {@link decided} when a product repeats. */
  readonly linesWritten: number;
  /** Products the model gave a kind for. */
  readonly decided: number;
  /**
   * Products left NULL — an explicit `unknown`, an omission, or a batch
   * whose answer could not be read. Counted rather than logged away,
   * because a pass that quietly decides nothing looks identical to one
   * that had nothing to do.
   */
  readonly undecided: number;
  /** Batches whose answer failed to parse. Their products stay NULL. */
  readonly unreadableBatches: number;
}

const DEFAULT_BATCH_SIZE = 40;

/**
 * Unclassified lines, most expensive first.
 *
 * Value order is what makes a partial run useful: Amazon spend is
 * concentrated enough that the top 100 lines are ~45% of it, so a run that
 * stops early has still bought most of the answer. Landed cost rather than
 * the line total, because postage and order-level discount are part of what
 * a thing cost.
 */
function unclassifiedItems(db: PurchasesDb): readonly BatchableItem[] {
  return db
    .select({
      id: purchaseItems.id,
      source: purchases.source,
      sku: purchaseItems.sku,
      skuScheme: purchaseItems.skuScheme,
      name: purchaseItems.name,
      merchantEntityId: purchases.merchantEntityId,
      merchantEntityName: purchases.merchantEntityName,
    })
    .from(purchaseItems)
    .innerJoin(purchases, eq(purchases.id, purchaseItems.purchaseId))
    .where(and(isNull(purchaseItems.kind), isNull(purchaseItems.kindConfirmedAt)))
    .orderBy(
      desc(
        sql`${purchaseItems.lineTotalCents} + ${purchaseItems.allocatedShippingCents} + ${purchaseItems.allocatedAdjustmentCents}`
      ),
      asc(purchaseItems.id)
    )
    .all();
}

export async function proposeItemKinds(
  db: PurchasesDb,
  proposer: ItemKindProposer,
  options: ProposeItemKindsOptions = {}
): Promise<ProposeItemKindsOutcome> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  // The cap is on products, not rows: one product can span many lines, so
  // grouping first is what makes `limit` mean "this many decisions".
  const all = toCandidates(unclassifiedItems(db), loadProductDictionary(db));
  const candidates = options.limit === undefined ? all : all.slice(0, options.limit);
  const batches = intoBatches(candidates, batchSize);

  let linesWritten = 0;
  let decided = 0;
  let unreadableBatches = 0;

  for (const [index, batch] of batches.entries()) {
    const raw = await proposer.propose(batch);
    if (raw === null) {
      unreadableBatches += 1;
      options.onBatch?.(index + 1, batches.length);
      continue;
    }

    let proposals: ReadonlyMap<string, ItemKind>;
    try {
      proposals = readKindProposals(raw, batch);
    } catch (error) {
      // One unreadable answer must not sink the run. The batch's lines stay
      // NULL, which is exactly where they started, and the next run picks
      // them up again by the same predicate.
      unreadableBatches += 1;
      console.warn(
        `[purchases-classify] batch ${String(index + 1)} was unreadable: ` +
          (error instanceof Error ? error.message : String(error))
      );
      options.onBatch?.(index + 1, batches.length);
      continue;
    }

    linesWritten += writeProposals(db, batch, proposals);
    decided += proposals.size;
    options.onBatch?.(index + 1, batches.length);
  }

  return {
    candidates: candidates.length,
    batches: batches.length,
    linesWritten,
    decided,
    undecided: candidates.length - decided,
    unreadableBatches,
  };
}

/**
 * Persist one batch's answers.
 *
 * One transaction per batch, not per run: a run over a year of history is
 * long enough that holding a single write transaction across every model
 * call would block ingest for its duration, and each batch's answers are
 * independent of every other batch's.
 */
function writeProposals(
  db: PurchasesDb,
  batch: readonly ProposalCandidate[],
  proposals: ReadonlyMap<string, ItemKind>
): number {
  return db.transaction((tx) => {
    let written = 0;
    for (const candidate of batch) {
      const kind = proposals.get(candidate.key);
      if (kind === undefined) continue;
      for (const itemId of candidate.itemIds) {
        written += tx
          .update(purchaseItems)
          .set({ kind })
          .where(
            and(
              eq(purchaseItems.id, itemId),
              // Re-checked at the write, not only at the read: a human may
              // have confirmed this line while the model was thinking, and
              // a proposal must never land on top of a decision.
              isNull(purchaseItems.kind),
              isNull(purchaseItems.kindConfirmedAt)
            )
          )
          .run().changes;
      }
    }
    return written;
  });
}
