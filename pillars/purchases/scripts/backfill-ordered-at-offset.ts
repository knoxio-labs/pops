/**
 * Fill `purchases.ordered_at_offset_minutes` for orders written before the
 * column existed — but only where evidence for it survives.
 *
 *   pnpm backfill:ordered-at-offset              # preview — prints what would change
 *   pnpm backfill:ordered-at-offset -- --write   # the same pass, committed
 *
 * POPS-2515 added the column and migration `0012_ordered_at_offset.sql`
 * deliberately backfilled nothing: the whole pending batch runs in one
 * transaction, SQL has no tzdata and so cannot do IANA DST arithmetic, and
 * inventing an offset for orders whose sources state an instant and no place
 * would manufacture wrong days where there are merely unknown ones. Migration
 * 0006 declined the same thing for the same reason. This is the other half
 * (POPS-2532): Node, tzdata, re-runnable, and evidence-only.
 *
 * **What counts as evidence, and what does not.**
 *
 *   - `purchase_capture.utc_offset_minutes` — the offset the device stated at
 *     capture. Exact, and used as-is.
 *   - `purchase_capture.declared_time_zone` — the IANA zone the client
 *     declared. Also exact: resolving it at the order's own `ordered_at` is
 *     the same arithmetic the ingest would have done, DST included.
 *   - Coordinates are NOT evidence here. Turning a latitude and longitude
 *     into a zone needs a boundary dataset this pillar does not carry, and a
 *     nearest-city guess is exactly the kind of confident wrong answer the
 *     migration refused to write.
 *   - An Amazon or amazon-digital order has neither. Its source stated an
 *     instant and no place, so **null is the correct final answer**, not a
 *     gap to fill. Null already means "the producer never knew", and readers
 *     handle it by naming the UTC day — an honest answer. Guessing the
 *     household zone for every historical row would convert unknown into
 *     confidently-wrong, and would be indistinguishable afterwards.
 *
 * **Idempotent by construction**: only rows whose offset is still null are
 * selected, so a second run finds strictly less to do and a completed run
 * finds nothing. Nothing here overwrites an offset an ingest already recorded.
 */
import { and, eq, isNull } from 'drizzle-orm';

import { resolvePurchasesSqlitePath } from '../src/api/purchases-sqlite-path.js';
import { openPurchasesDb, purchaseCapture, purchases, type PurchasesDb } from '../src/db/index.js';
import {
  isKnownTimeZone,
  isPlausibleUtcOffsetMinutes,
  utcOffsetMinutesAt,
} from '../src/ingest/local-time.js';
import { isCliEntrypoint, runCli } from './backfill.js';

/** Where a recovered offset came from, or why there is none. */
export type OffsetEvidence =
  | 'capture-offset'
  | 'declared-zone'
  | 'no-capture-row'
  | 'capture-states-no-zone'
  | 'unusable-evidence';

export interface OffsetRecovery {
  readonly purchaseId: string;
  readonly source: string;
  readonly offsetMinutes: number | null;
  readonly evidence: OffsetEvidence;
}

interface CandidateRow {
  readonly purchaseId: string;
  readonly source: string;
  readonly orderedAt: string;
  readonly captureOffsetMinutes: number | null;
  readonly declaredTimeZone: string | null;
  readonly hasCapture: boolean;
}

/**
 * Decide one order's offset from what its capture row states.
 *
 * Exported for its own test: this is the whole judgement, and every arm of it
 * is a decision about whether a stored day is about to become right or wrong.
 * An offset outside ±14:00 or a zone the runtime does not know is treated as
 * no evidence at all rather than written through — the same refusal the
 * ingest makes, and the stored column carries that bound as a CHECK, so
 * writing one anyway would fail the whole run on a garbled row.
 */
export function recoverOffset(row: CandidateRow): OffsetRecovery {
  const base = { purchaseId: row.purchaseId, source: row.source };
  if (!row.hasCapture) return { ...base, offsetMinutes: null, evidence: 'no-capture-row' };

  const stated = row.captureOffsetMinutes;
  if (stated !== null && isPlausibleUtcOffsetMinutes(stated)) {
    return { ...base, offsetMinutes: stated, evidence: 'capture-offset' };
  }

  if (isKnownTimeZone(row.declaredTimeZone)) {
    const resolved = utcOffsetMinutesAt(row.orderedAt, row.declaredTimeZone);
    if (resolved !== null && isPlausibleUtcOffsetMinutes(resolved)) {
      return { ...base, offsetMinutes: resolved, evidence: 'declared-zone' };
    }
  }

  const statedSomething = stated !== null || row.declaredTimeZone !== null;
  return {
    ...base,
    offsetMinutes: null,
    evidence: statedSomething ? 'unusable-evidence' : 'capture-states-no-zone',
  };
}

/** Every order still missing an offset, with what its capture row says about it. */
export function listCandidates(db: PurchasesDb): CandidateRow[] {
  return db
    .select({
      purchaseId: purchases.id,
      source: purchases.source,
      orderedAt: purchases.orderedAt,
      captureOffsetMinutes: purchaseCapture.utcOffsetMinutes,
      declaredTimeZone: purchaseCapture.declaredTimeZone,
      capturedPurchaseId: purchaseCapture.purchaseId,
    })
    .from(purchases)
    .leftJoin(purchaseCapture, eq(purchaseCapture.purchaseId, purchases.id))
    .where(isNull(purchases.orderedAtOffsetMinutes))
    .all()
    .map((row) => ({
      purchaseId: row.purchaseId,
      source: row.source,
      orderedAt: row.orderedAt,
      captureOffsetMinutes: row.captureOffsetMinutes,
      declaredTimeZone: row.declaredTimeZone,
      hasCapture: row.capturedPurchaseId !== null,
    }));
}

/** What a run would do, in order. */
export function planOffsetBackfill(db: PurchasesDb): OffsetRecovery[] {
  return listCandidates(db).map(recoverOffset);
}

/**
 * Write the recovered offsets.
 *
 * Each update re-states `ordered_at_offset_minutes IS NULL` in its own WHERE
 * rather than trusting the plan: the plan is a read taken before the write,
 * and an ingest that recorded an offset in between states a fact this pass
 * has no business overwriting with an older one.
 *
 * @returns How many rows were actually changed.
 */
export function applyOffsetBackfill(db: PurchasesDb, plan: readonly OffsetRecovery[]): number {
  let changed = 0;
  for (const entry of plan) {
    if (entry.offsetMinutes === null) continue;
    const result = db
      .update(purchases)
      .set({ orderedAtOffsetMinutes: entry.offsetMinutes })
      .where(and(eq(purchases.id, entry.purchaseId), isNull(purchases.orderedAtOffsetMinutes)))
      .run();
    changed += result.changes;
  }
  return changed;
}

export interface SourceTally {
  readonly set: number;
  readonly leftNull: number;
  readonly byEvidence: Readonly<Record<OffsetEvidence, number>>;
}

/**
 * Per-source counts of set-vs-left-null, and why each was left.
 *
 * Per source because the answer differs by source and a single total hides
 * that: an Amazon row left null is the correct final state, and a receipt
 * upload left null is a capture row that carried nothing — the same number
 * meaning two different things.
 */
export function tallyBySource(plan: readonly OffsetRecovery[]): Map<string, SourceTally> {
  const tallies = new Map<
    string,
    { set: number; leftNull: number; byEvidence: Record<string, number> }
  >();
  for (const entry of plan) {
    const tally = tallies.get(entry.source) ?? { set: 0, leftNull: 0, byEvidence: {} };
    if (entry.offsetMinutes === null) tally.leftNull += 1;
    else tally.set += 1;
    tally.byEvidence[entry.evidence] = (tally.byEvidence[entry.evidence] ?? 0) + 1;
    tallies.set(entry.source, tally);
  }
  return new Map(
    [...tallies].map(([source, tally]) => [
      source,
      {
        set: tally.set,
        leftNull: tally.leftNull,
        byEvidence: tally.byEvidence as SourceTally['byEvidence'],
      },
    ])
  );
}

/** The report a run prints, whether or not it wrote. */
export function report(plan: readonly OffsetRecovery[], wrote: number | null): string[] {
  const lines: string[] = [];
  const tallies = [...tallyBySource(plan)].toSorted(([a], [b]) => a.localeCompare(b));
  lines.push(`${plan.length} order(s) still carry no recorded offset.`);
  for (const [source, tally] of tallies) {
    const reasons = Object.entries(tally.byEvidence)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([evidence, count]) => `${evidence}=${count}`)
      .join(', ');
    lines.push(`  ${source}: ${tally.set} recoverable, ${tally.leftNull} left null (${reasons})`);
  }
  lines.push(
    wrote === null
      ? 'Preview only — nothing was written. Re-run with --write to commit.'
      : `Wrote ${wrote} row(s).`
  );
  return lines;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const write = argv.includes('--write');
  const opened = openPurchasesDb(resolvePurchasesSqlitePath());
  try {
    const plan = planOffsetBackfill(opened.db);
    const wrote = write ? applyOffsetBackfill(opened.db, plan) : null;
    console.warn(report(plan, wrote).join('\n'));
  } finally {
    opened.raw.close();
  }
}

if (isCliEntrypoint(import.meta.url)) {
  await runCli(main);
}
