/**
 * Run the product dictionary's proposal pass against the SQLite file.
 *
 *   pnpm propose:products              # preview — prints what would change
 *   pnpm propose:products -- --write   # the same pass, committed
 *
 * Like `propose:kinds` this goes at the database rather than over HTTP, so it
 * needs no base URL and no service-account key. Unlike it, this pass calls no
 * model, so a preview costs nothing but a scan.
 *
 * **The preview is the default, and it leaves the dictionary as it found it.**
 * It runs the real pass inside a transaction it then rolls back, so its counts
 * and its sampled wordings come from the pass itself rather than from a second
 * code path that could disagree with it. Two things it does not promise: the
 * file is still opened the way every command here opens it, which applies any
 * pending migration; and a later `--write` run is a fresh scan, so on a
 * database still being written to the two runs can legitimately differ.
 *
 * The default is the preview because this pass deletes: it retires the
 * unconfirmed entries no line prints any more, and the first run against a
 * real purchase history is the one place an operator most wants to look
 * before that happens. `propose:kinds` defaults the other way because it only
 * ever fills a NULL and can destroy nothing.
 *
 * The pass will not delete a product a human named — it holds back the
 * wordings reaching one, so nothing orphans it. The preview still names every
 * product a run would delete, because a run that names one whose label no
 * retired wording spells is a run that found a hole in that guarantee, and
 * that is exactly what an operator needs to see before committing it.
 */
import { resolvePurchasesSqlitePath } from '../src/api/purchases-sqlite-path.js';
import {
  openPurchasesDb,
  proposeProducts,
  purchaseProductAliases,
  purchaseProducts,
  type ProposalOutcome,
  type PurchasesDb,
} from '../src/db/index.js';
import { isCliEntrypoint, runCli } from './backfill.js';

/** How many minted and retired wordings are named before the rest are counted. */
const SAMPLE_LIMIT = 10;

/** A dictionary entry, identified the way an operator reads one. */
export interface DictionaryEntry {
  /** The merchant scope the wording is confined to. */
  readonly scopeKey: string;
  /** The wording as the newest line printed it. */
  readonly printedName: string;
}

/** What a run did, or — in a preview — what it would have done. */
export interface PassReport {
  readonly outcome: ProposalOutcome;
  readonly minted: readonly DictionaryEntry[];
  readonly retired: readonly DictionaryEntry[];
  /** Labels of the products deleted for having no wordings left. */
  readonly deletedProducts: readonly string[];
}

/** Thrown to abort the preview transaction, never propagated to a caller. */
class PreviewRollback extends Error {
  constructor() {
    super('preview complete');
    this.name = 'PreviewRollback';
  }
}

export interface PassOptions {
  /** False runs the pass and rolls it back; true commits it. */
  readonly write: boolean;
}

/**
 * Read the CLI's arguments.
 *
 * Unrecognised arguments are refused rather than ignored: every flag this
 * script does not know about would otherwise land on the preview path, and an
 * operator who mistyped `--write` would be told nothing and see a run that
 * wrote nothing.
 *
 * A bare `--` is dropped first. `pnpm propose:products -- --write` hands the
 * separator to the script rather than eating it, so refusing it would refuse
 * the documented way of passing the flag at all.
 *
 * @throws When an argument is unrecognised, or when both modes are named.
 */
export function parseArgs(argv: readonly string[]): PassOptions {
  const args = argv.filter((arg) => arg !== '--');
  const unknown = args.filter((arg) => arg !== '--write' && arg !== '--dry-run');
  if (unknown.length > 0) {
    throw new Error(
      `unrecognised argument(s) ${unknown.join(' ')}\n` +
        'usage: pnpm propose:products [-- --write]\n' +
        'The pass takes no scope or limit: it reads every line by design.'
    );
  }
  if (args.includes('--write') && args.includes('--dry-run')) {
    throw new Error('--write and --dry-run contradict each other; pass one or neither');
  }
  return { write: args.includes('--write') };
}

function snapshotEntries(db: PurchasesDb): Map<string, DictionaryEntry> {
  const rows = db
    .select({
      id: purchaseProductAliases.id,
      scopeKey: purchaseProductAliases.scopeKey,
      printedName: purchaseProductAliases.printedName,
    })
    .from(purchaseProductAliases)
    .all();
  return new Map(
    rows.map((row): [string, DictionaryEntry] => [
      row.id,
      { scopeKey: row.scopeKey, printedName: row.printedName },
    ])
  );
}

function snapshotProducts(db: PurchasesDb): Map<string, string> {
  const rows = db
    .select({ id: purchaseProducts.id, label: purchaseProducts.label })
    .from(purchaseProducts)
    .all();
  return new Map(rows.map((row): [string, string] => [row.id, row.label]));
}

function difference<T>(from: ReadonlyMap<string, T>, to: ReadonlyMap<string, T>): readonly T[] {
  const gone: T[] = [];
  for (const [id, value] of from) {
    if (!to.has(id)) gone.push(value);
  }
  return gone;
}

/**
 * The pass, plus the entries it minted, the entries it retired, and the
 * products those retirements took with them.
 *
 * The snapshots are what turn {@link ProposalOutcome}'s counts into something
 * an operator can check: "would retire 41" says nothing about whether those
 * 41 are wordings that genuinely stopped being printed.
 */
function runAndCapture(db: PurchasesDb): PassReport {
  const entriesBefore = snapshotEntries(db);
  const productsBefore = snapshotProducts(db);
  const outcome = proposeProducts(db);
  const entriesAfter = snapshotEntries(db);
  const productsAfter = snapshotProducts(db);
  return {
    outcome,
    minted: difference(entriesAfter, entriesBefore),
    retired: difference(entriesBefore, entriesAfter),
    deletedProducts: difference(productsBefore, productsAfter),
  };
}

/**
 * Run the pass, committing only when asked.
 *
 * Both modes run the identical service call — no second code path that could
 * disagree with the real one — inside one transaction, which the preview
 * aborts and the write commits. The before-snapshot belongs inside it in both
 * modes: taken outside, a write landing between the snapshot and the pass
 * would be reported as something the pass did, on the one run whose output is
 * the only surviving record of what it deleted.
 *
 * `proposeProducts` opens a transaction of its own, which nests as a
 * savepoint inside this one.
 */
export function runProposalPass(db: PurchasesDb, options: PassOptions): PassReport {
  let report: PassReport | undefined;
  try {
    db.transaction((tx) => {
      report = runAndCapture(tx);
      if (!options.write) throw new PreviewRollback();
    });
  } catch (error) {
    if (!(error instanceof PreviewRollback)) throw error;
  }
  if (report === undefined) throw new Error('the pass transaction returned without running');
  return report;
}

function sample(label: string, lines: readonly string[]): readonly string[] {
  if (lines.length === 0) return [];
  const shown = lines.slice(0, SAMPLE_LIMIT).map((line) => `  ${label} ${line}`);
  const rest = lines.length - SAMPLE_LIMIT;
  return rest > 0 ? [...shown, `  ${label} … and ${String(rest)} more`] : shown;
}

function wordings(entries: readonly DictionaryEntry[]): readonly string[] {
  return entries.map((entry) => `${entry.scopeKey} · ${entry.printedName}`);
}

/**
 * The deleted products the retire lines do not already name.
 *
 * A product this pass minted carries its wording as its label, so naming it
 * again says nothing. Anything else is a label no retired wording spells,
 * which the pass is meant never to be able to delete — so the report says it
 * out loud rather than folding it into a count, and an empty list here is the
 * check that the naming marker is doing its job.
 */
function unnamedDeletions(report: PassReport): readonly string[] {
  const named = new Set(report.retired.map((entry) => entry.printedName));
  return report.deletedProducts
    .filter((label) => !named.has(label))
    .map((label) => `product "${label}"`);
}

export interface ReportContext extends PassOptions {
  readonly path: string;
}

/** What the run is about to do, printed before it starts doing it. */
export function describePassTarget(context: ReportContext): string {
  return `${context.write ? 'writing to' : 'preview against'} ${context.path}`;
}

/** The run, as an operator reads it. */
export function describePassReport(report: PassReport, context: ReportContext): string {
  const { outcome } = report;
  const products = String(report.deletedProducts.length);
  const changed = context.write
    ? `minted ${String(outcome.proposed)} entries, retired ${String(outcome.retired)} ` +
      `and deleted ${products} products`
    : `would mint ${String(outcome.proposed)} entries, retire ${String(outcome.retired)} ` +
      `and delete ${products} products`;
  return [
    `scanned ${String(outcome.scannedLines)} lines carrying ${String(outcome.observedWordings)} ` +
      'distinct wordings',
    `${changed}, leaving ${String(outcome.confirmed)} confirmed entries untouched`,
    ...sample('mint  ', wordings(report.minted)),
    ...sample('retire', wordings(report.retired)),
    ...sample('delete', unnamedDeletions(report)),
    context.write ? 'committed' : 'nothing was written — re-run with `-- --write` to commit',
  ].join('\n');
}

export function main(argv: readonly string[] = process.argv.slice(2)): void {
  const options = parseArgs(argv);
  const path = resolvePurchasesSqlitePath();
  const context = { ...options, path };
  console.warn(describePassTarget(context));
  const opened = openPurchasesDb(path);
  try {
    console.warn(describePassReport(runProposalPass(opened.db, options), context));
  } finally {
    opened.raw.close();
  }
}

if (isCliEntrypoint(import.meta.url)) {
  await runCli(main);
}
