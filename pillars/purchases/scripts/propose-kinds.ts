/**
 * Propose a kind for every unclassified line.
 *
 *   pnpm propose:kinds -- [--limit 100] [--batch-size 40] [--dry-run]
 *
 * Runs against the SQLite file directly rather than over HTTP, because
 * proposing is not a wire operation — there is no route for it and there
 * should not be one. Confirming is, and that is
 * `PATCH /purchases/:id/items/:itemId`.
 *
 * Safe to interrupt and safe to re-run: the pass selects by `kind IS NULL`
 * and commits per batch, so a second run picks up exactly what the first
 * did not finish and can never revisit a line a human has decided.
 *
 * To re-propose after a better model, clear the proposals first — that is a
 * separate statement on purpose, and by construction it cannot touch a
 * decision:
 *
 *   UPDATE purchase_items SET kind = NULL WHERE kind_confirmed_at IS NULL;
 */
import { resolvePurchasesSqlitePath } from '../src/api/purchases-sqlite-path.js';
import {
  createAnthropicItemKindProposer,
  itemKindModel,
} from '../src/classify/anthropic-proposer.js';
import { proposeItemKinds } from '../src/classify/propose-item-kind.js';
import { openPurchasesDb } from '../src/db/open-purchases-db.js';

function numericFlag(argv: readonly string[], flag: string): number | undefined {
  const at = argv.indexOf(flag);
  if (at === -1) return undefined;
  const value = Number(argv[at + 1]);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${flag} needs a positive integer, got ${String(argv[at + 1])}`);
  }
  return value;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const limit = numericFlag(argv, '--limit');
  const batchSize = numericFlag(argv, '--batch-size');

  const proposer = createAnthropicItemKindProposer();
  if (proposer === null) {
    throw new Error(
      'no Anthropic API key: set ANTHROPIC_API_KEY_FILE or ANTHROPIC_API_KEY. ' +
        'Ingest does not need one; this pass does.'
    );
  }

  const path = resolvePurchasesSqlitePath();
  const opened = openPurchasesDb(path);
  try {
    if (argv.includes('--dry-run')) {
      // Counting the work without spending anything on it. The pass itself
      // has no dry-run mode: a model call that produces nothing is the one
      // thing worth never accidentally paying for.
      const pending = opened.raw
        .prepare(`SELECT count(*) AS n FROM purchase_items WHERE kind IS NULL`)
        .get() as { n: number };
      console.warn(`--dry-run: ${String(pending.n)} unclassified lines in ${path}`);
      return;
    }

    console.warn(`classifying against ${itemKindModel()} using ${path}`);
    const outcome = await proposeItemKinds(opened.db, proposer, {
      limit,
      batchSize,
      onBatch: (done, total) => {
        console.warn(`batch ${String(done)}/${String(total)}`);
      },
    });
    console.warn(
      `${String(outcome.decided)}/${String(outcome.candidates)} products decided, ` +
        `${String(outcome.linesWritten)} lines written, ` +
        `${String(outcome.undecided)} left unclassified, ` +
        `${String(outcome.unreadableBatches)} unreadable batches`
    );
  } finally {
    opened.raw.close();
  }
}

await main();
