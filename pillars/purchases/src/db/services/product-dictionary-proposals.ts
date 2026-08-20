/**
 * The dictionary's proposal pass.
 *
 * It mints one entry per printed wording the stored lines carry, and retires
 * the unconfirmed entries nothing prints any more. Nothing here interprets a
 * wording — the entry it mints groups exactly the lines the on-the-fly
 * grouping already grouped, which is what makes running it risk-free.
 *
 * **Over every line, with no filter, on purpose.** Deriving the dictionary
 * from a window would retire entries whose lines merely fell outside it — the
 * partial-answer trap, and here it destroys data rather than understating it.
 * The cost is one scan of `purchase_items` joined to its order, which is the
 * same scan the product leaderboard already makes.
 *
 * **A confirmed entry is untouchable.** It is not retired when its wording
 * stops appearing (a human's assertion outlives the line that prompted it, and
 * that line may only have been deleted and re-ingested), it is not repointed,
 * and it is not relabelled. That is the whole content of the `confirmedAt`
 * marker: null means this pass owns the row, non-null means it does not.
 */
import { eq, inArray } from 'drizzle-orm';

import { purchaseItems, purchaseProductAliases, purchaseProducts, purchases } from '../schema.js';
import { expectRow } from './internal.js';
import { deleteOrphanedProducts } from './product-dictionary-writes.js';
import { normalisedName, productLookupKey, productScopeKey } from './product-identity.js';

import type { PurchaseProductAliasRow } from '../schema.js';
import type { PurchasesDb } from './internal.js';

/** What one run of the pass changed. */
export interface ProposalOutcome {
  /** Lines read. Every line, including the sku-keyed ones the pass skips. */
  readonly scannedLines: number;
  /** Distinct scoped wordings the lines print, which is the pass's whole input. */
  readonly observedWordings: number;
  /** Entries minted for a wording that had none. */
  readonly proposed: number;
  /** Unconfirmed entries retired because no line prints that wording any more. */
  readonly retired: number;
  /** Entries left alone because a human asserted them. */
  readonly confirmed: number;
}

interface ObservedWording {
  readonly scopeKey: string;
  readonly source: string;
  readonly normalised: string;
  /** The newest line's printing of it, which is what a fresh entry is labelled with. */
  printedName: string;
  rank: string;
}

interface ScannedLine {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly source: string;
  readonly orderedAt: string;
  readonly merchantEntityId: string | null;
  readonly merchantEntityName: string | null;
}

/**
 * Run the pass. Idempotent — running it twice over unchanged lines changes
 * nothing.
 */
export function proposeProducts(db: PurchasesDb): ProposalOutcome {
  const lines = scanLines(db);
  const observed = observeWordings(lines);
  const existing = db.select().from(purchaseProductAliases).all();

  const retired = retireUnobserved(db, existing, observed);
  const held = new Set(
    existing
      .filter((alias) => !retired.has(alias.id))
      .map((alias) => productLookupKey(alias.scopeKey, alias.normalisedName))
  );

  let proposed = 0;
  for (const [key, wording] of observed) {
    if (held.has(key)) continue;
    mintProposal(db, wording);
    proposed += 1;
  }

  return {
    scannedLines: lines.length,
    observedWordings: observed.size,
    proposed,
    retired: retired.size,
    confirmed: existing.filter((alias) => alias.confirmedAt !== null).length,
  };
}

function scanLines(db: PurchasesDb): readonly ScannedLine[] {
  return db
    .select({
      id: purchaseItems.id,
      name: purchaseItems.name,
      sku: purchaseItems.sku,
      source: purchases.source,
      orderedAt: purchases.orderedAt,
      merchantEntityId: purchases.merchantEntityId,
      merchantEntityName: purchases.merchantEntityName,
    })
    .from(purchaseItems)
    .innerJoin(purchases, eq(purchases.id, purchaseItems.purchaseId))
    .all();
}

/**
 * The scoped wordings the lines print, each remembering the newest line's
 * spelling of it — so a fresh entry is labelled with the most recent printing
 * rather than with whichever row the query happened to return first, which
 * would make the label depend on read order.
 *
 * A line that states a sku is skipped entirely: the dictionary is never
 * consulted for one, so an entry minted from it could never be reached.
 */
function observeWordings(lines: readonly ScannedLine[]): Map<string, ObservedWording> {
  const observed = new Map<string, ObservedWording>();
  for (const line of lines) {
    if ((line.sku?.trim() ?? '') !== '') continue;
    const normalised = normalisedName(line.name);
    if (normalised === '') continue;

    const scopeKey = productScopeKey(line);
    const key = productLookupKey(scopeKey, normalised);
    const rank = `${line.orderedAt} ${line.id}`;
    const held = observed.get(key);
    if (held === undefined) {
      observed.set(key, {
        scopeKey,
        source: line.source,
        normalised,
        printedName: line.name,
        rank,
      });
    } else if (rank > held.rank) {
      held.printedName = line.name;
      held.rank = rank;
    }
  }
  return observed;
}

/** The unconfirmed entries no line prints any more, deleted. Returns their ids. */
function retireUnobserved(
  db: PurchasesDb,
  existing: readonly PurchaseProductAliasRow[],
  observed: ReadonlyMap<string, ObservedWording>
): ReadonlySet<string> {
  const stale = existing.filter(
    (alias) =>
      alias.confirmedAt === null &&
      !observed.has(productLookupKey(alias.scopeKey, alias.normalisedName))
  );
  if (stale.length === 0) return new Set();

  db.delete(purchaseProductAliases)
    .where(
      inArray(
        purchaseProductAliases.id,
        stale.map((alias) => alias.id)
      )
    )
    .run();
  deleteOrphanedProducts(db);
  return new Set(stale.map((alias) => alias.id));
}

function mintProposal(db: PurchasesDb, wording: ObservedWording): void {
  const product = expectRow(
    db.insert(purchaseProducts).values({ label: wording.printedName }).returning().all(),
    'mintProposal'
  );
  db.insert(purchaseProductAliases)
    .values({
      productId: product.id,
      scopeKey: wording.scopeKey,
      source: wording.source,
      normalisedName: wording.normalised,
      printedName: wording.printedName,
      confirmedAt: null,
    })
    .run();
}
