/**
 * Run the product dictionary's proposal pass against the SQLite file.
 *
 *   pnpm propose:products              # preview — prints what would change, writes nothing
 *   pnpm propose:products -- --write   # the same pass, committed
 *
 * Like `propose:kinds` this goes at the database rather than over HTTP, so it
 * needs no base URL and no service-account key. Unlike it, this pass calls no
 * model, so a preview costs nothing but a scan.
 *
 * **The preview is exact, and it is the default.** It runs the real pass
 * inside a transaction it then rolls back, so the counts and the sampled
 * wordings below are what a `--write` run would do to this database, not an
 * estimate of it. The default is the preview because this pass deletes: it
 * retires the unconfirmed entries no line prints any more, and the first run
 * against a real purchase history is the one place an operator most wants to
 * look before that happens. `propose:kinds` defaults the other way because it
 * only ever fills a NULL and can destroy nothing.
 *
 * A confirmed entry is out of the pass's reach in either mode — that is the
 * whole content of `confirmedAt`, and it is enforced in the service rather
 * than here.
 */
import { resolvePurchasesSqlitePath } from '../src/api/purchases-sqlite-path.js';
import {
  openPurchasesDb,
  proposeProducts,
  purchaseProductAliases,
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

function difference(
  from: ReadonlyMap<string, DictionaryEntry>,
  to: ReadonlyMap<string, DictionaryEntry>
): readonly DictionaryEntry[] {
  const gone: DictionaryEntry[] = [];
  for (const [id, entry] of from) {
    if (!to.has(id)) gone.push(entry);
  }
  return gone;
}

/**
 * The pass, plus the entries it minted and retired.
 *
 * The two snapshots are what turn {@link ProposalOutcome}'s counts into
 * something an operator can check: "would retire 41" says nothing about
 * whether those 41 are wordings that genuinely stopped being printed.
 */
function runAndCapture(db: PurchasesDb): PassReport {
  const before = snapshotEntries(db);
  const outcome = proposeProducts(db);
  const after = snapshotEntries(db);
  return { outcome, minted: difference(after, before), retired: difference(before, after) };
}

/**
 * Run the pass, committing only when asked.
 *
 * The preview runs the identical service call — no second code path that
 * could disagree with the real one — inside a transaction that is always
 * rolled back. `proposeProducts` opens a transaction of its own, which
 * nests as a savepoint inside this one.
 */
export function runProposalPass(db: PurchasesDb, options: PassOptions): PassReport {
  if (options.write) return runAndCapture(db);

  let report: PassReport | undefined;
  try {
    db.transaction((tx) => {
      report = runAndCapture(tx);
      throw new PreviewRollback();
    });
  } catch (error) {
    if (!(error instanceof PreviewRollback)) throw error;
  }
  if (report === undefined) throw new Error('the preview transaction returned without running');
  return report;
}

function sample(label: string, entries: readonly DictionaryEntry[]): readonly string[] {
  if (entries.length === 0) return [];
  const shown = entries
    .slice(0, SAMPLE_LIMIT)
    .map((entry) => `  ${label} ${entry.scopeKey} · ${entry.printedName}`);
  const rest = entries.length - SAMPLE_LIMIT;
  return rest > 0 ? [...shown, `  ${label} … and ${String(rest)} more`] : shown;
}

export interface ReportContext extends PassOptions {
  readonly path: string;
}

/** The run, as an operator reads it. */
export function describePassReport(report: PassReport, context: ReportContext): string {
  const { outcome } = report;
  const changed = context.write
    ? `minted ${String(outcome.proposed)} entries and retired ${String(outcome.retired)}`
    : `would mint ${String(outcome.proposed)} entries and retire ${String(outcome.retired)}`;
  return [
    `${context.write ? 'writing to' : 'preview against'} ${context.path}`,
    `scanned ${String(outcome.scannedLines)} lines carrying ${String(outcome.observedWordings)} ` +
      'distinct wordings',
    `${changed}, leaving ${String(outcome.confirmed)} confirmed entries untouched`,
    ...sample('mint  ', report.minted),
    ...sample('retire', report.retired),
    context.write
      ? 'committed'
      : 'nothing was written — re-run with `-- --write` to commit this exact result',
  ].join('\n');
}

export function main(argv: readonly string[] = process.argv.slice(2)): void {
  const options = parseArgs(argv);
  const path = resolvePurchasesSqlitePath();
  const opened = openPurchasesDb(path);
  try {
    console.warn(describePassReport(runProposalPass(opened.db, options), { ...options, path }));
  } finally {
    opened.raw.close();
  }
}

if (isCliEntrypoint(import.meta.url)) {
  await runCli(main);
}
