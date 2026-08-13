/**
 * The per-column reconciliation loop behind the soft-URI cron, plus the
 * vocabulary it and its adapters share.
 *
 * Lives in a sibling file so the worker in `reconcile-cross-pillar.ts`
 * stays under the file-size budget — the same split the inventory cron
 * uses (`reconcile-cross-pillar-runner.ts`).
 *
 * A "leg" is one column's worth of work: where the URIs come from, what
 * shape they must have, who answers for them, and how to mark or clear the
 * companion flag. Two of them today; a third cross-pillar reference would
 * be a row in {@link LEGS} rather than a second loop.
 */
import {
  clearDocumentUriStale,
  clearInventoryItemUriStale,
  listDistinctDocumentUris,
  listDistinctInventoryItemUris,
  markDocumentUriStale,
  markInventoryItemUriStale,
  type PurchasesDb,
} from '../../db/index.js';

export type ReconcileLookupResult =
  | { kind: 'ok' }
  | { kind: 'not-found' }
  | { kind: 'bad-uri'; reason: string }
  /**
   * The owning pillar refused this pillar's service-account credential, or
   * this process had none to send. Preserved like `unavailable` — a pillar
   * that would not answer says nothing about whether the row exists — but
   * counted and logged apart from it, because waiting fixes an outage and
   * does not fix a grant.
   */
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'unavailable'; reason: string };

/**
 * Probe one reference by the id parsed out of its URI.
 *
 * Takes the id rather than the whole URI — unlike the finance cron, whose
 * single peer happens to accept a URI verbatim. Both peers here address by
 * id (`GET /items/:id`, `GET /paperless/documents/:id`), so parsing in the
 * loop keeps the shape check in one place and leaves the adapters as pure
 * transport.
 */
export type ReconcileLookupFn = (id: string) => Promise<ReconcileLookupResult>;

export interface ReconcileLookups {
  /** Resolves `pops://inventory/item/<id>`. */
  inventoryItem: ReconcileLookupFn;
  /** Resolves `pops://documents/document/<id>`. */
  document: ReconcileLookupFn;
}

export interface ReconcileWorkerLogger {
  info?: (msg: string, meta?: Record<string, unknown>) => void;
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * The five outcomes a URI in the work set can have, tallied per leg and
 * again per tick. Not just probed URIs: one addressed to the wrong pillar
 * is counted as `badUri` by {@link runLeg} without ever being probed.
 *
 * `unauthorized` is deliberately not folded into `unavailable`. A tick that
 * reports every URI unavailable reads as a peer being down and is normally
 * survivable; the same tick reporting them unauthorized means this pillar
 * cannot reconcile at all until a grant is fixed, and it will keep saying so
 * every night until someone does.
 */
export interface ReconcileCounts {
  resolved: number;
  staleMarked: number;
  badUri: number;
  unauthorized: number;
  unavailable: number;
}

/**
 * One leg's tick.
 *
 * `checked` is the size of the work set — every distinct URI the leg had to
 * consider, including those rejected on shape and never probed — so it
 * always equals the sum of the four counters.
 *
 * It is reported because the counters alone cannot express an empty leg. A
 * leg no writer populates yet and a leg whose every reference resolved both
 * tally four zeros against a healthy-looking tick, and a column that is
 * never checked reads exactly like a column where nothing is wrong. That
 * ambiguity is the whole reason the `staleAt` companions exist.
 */
export interface ReconcileLegStats extends ReconcileCounts {
  leg: string;
  checked: number;
}

/** Totals across every leg of one tick, plus each leg's own line. */
export interface ReconcileTickStats extends ReconcileCounts {
  legs: ReconcileLegStats[];
}

export interface ParsedUri {
  pillar: string;
  type: string;
  id: string;
}

/**
 * Parse `pops://<pillar>/<type>/<id>`. `null` for any shape that is not a
 * well-formed soft reference; the caller treats those as bad URIs.
 */
export function parseSoftUri(uri: string): ParsedUri | null {
  const match = /^pops:\/\/([^/]+)\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) return null;
  const [, pillar, type, id] = match;
  if (!pillar || !type || !id) return null;
  return { pillar, type, id };
}

/** One column's worth of reconciliation. Constructed only as a row in {@link LEGS}. */
export interface ReconcileLeg {
  readonly label: string;
  readonly expectedPillar: string;
  readonly expectedType: string;
  readonly listUris: (db: PurchasesDb) => string[];
  readonly markStale: (db: PurchasesDb, uri: string, nowIso: string) => number;
  readonly clearStale: (db: PurchasesDb, uri: string) => number;
  readonly lookup: (lookups: ReconcileLookups) => ReconcileLookupFn;
}

export const LEGS: readonly ReconcileLeg[] = [
  {
    label: 'inventory-item',
    expectedPillar: 'inventory',
    expectedType: 'item',
    listUris: listDistinctInventoryItemUris,
    markStale: markInventoryItemUriStale,
    clearStale: clearInventoryItemUriStale,
    lookup: (lookups) => lookups.inventoryItem,
  },
  {
    label: 'document',
    expectedPillar: 'documents',
    expectedType: 'document',
    listUris: listDistinctDocumentUris,
    markStale: markDocumentUriStale,
    clearStale: clearDocumentUriStale,
    lookup: (lookups) => lookups.document,
  },
];

export function emptyCounts(): ReconcileCounts {
  return { resolved: 0, staleMarked: 0, badUri: 0, unauthorized: 0, unavailable: 0 };
}

/** Fold one leg's counters into a running total. */
export function addCounts(into: ReconcileCounts, from: ReconcileCounts): void {
  into.resolved += from.resolved;
  into.staleMarked += from.staleMarked;
  into.badUri += from.badUri;
  into.unauthorized += from.unauthorized;
  into.unavailable += from.unavailable;
}

async function safeLookup(
  lookup: ReconcileLookupFn,
  id: string,
  logger: ReconcileWorkerLogger | undefined
): Promise<ReconcileLookupResult> {
  try {
    return await lookup(id);
  } catch (err) {
    logger?.warn?.('purchases reconcile lookup threw', {
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { kind: 'unavailable', reason: 'lookup-threw' };
  }
}

interface ApplyContext {
  db: PurchasesDb;
  leg: ReconcileLeg;
  uri: string;
  nowIso: string;
  stats: ReconcileCounts;
  logger: ReconcileWorkerLogger | undefined;
}

// The two writes below stand on their own line on purpose: inlined into a
// logger argument they would be skipped entirely whenever no logger is
// configured, and the cron would silently reconcile nothing.
function applyOk(ctx: ApplyContext): void {
  const cleared = ctx.leg.clearStale(ctx.db, ctx.uri);
  ctx.logger?.info?.('purchases reconcile uri resolved', { ...legMeta(ctx), cleared });
}

function applyNotFound(ctx: ApplyContext): void {
  const marked = ctx.leg.markStale(ctx.db, ctx.uri, ctx.nowIso);
  ctx.logger?.info?.('purchases reconcile uri marked stale', { ...legMeta(ctx), marked });
}

function legMeta(ctx: ApplyContext): { leg: string; uri: string } {
  return { leg: ctx.leg.label, uri: ctx.uri };
}

/**
 * The reason a credential outcome could not probe, as a headline.
 *
 * `no-credential` is this process holding no key at all — nothing was sent
 * and no callee has an opinion yet — which is a different job from a key
 * that was sent and refused.
 */
function credentialWarning(reason: string): string {
  return reason === 'no-credential'
    ? 'purchases reconcile has no service-account key (preserved for ops)'
    : 'purchases reconcile credential refused (preserved for ops)';
}

/** One warning about a URI whose row was left exactly as it was. */
function warnPreserved(ctx: ApplyContext, message: string, reason: string): void {
  ctx.logger?.warn?.(message, { ...legMeta(ctx), reason });
}

function applyResult(ctx: ApplyContext, result: ReconcileLookupResult): void {
  switch (result.kind) {
    case 'ok':
      ctx.stats.resolved += 1;
      applyOk(ctx);
      return;
    case 'not-found':
      ctx.stats.staleMarked += 1;
      applyNotFound(ctx);
      return;
    case 'bad-uri':
      ctx.stats.badUri += 1;
      warnPreserved(ctx, 'purchases reconcile bad uri (preserved for ops)', result.reason);
      return;
    case 'unauthorized':
      ctx.stats.unauthorized += 1;
      // The two reasons send an operator to different places — a grant to
      // widen versus a key to provision — so the headline says which rather
      // than leaving it to whoever reads the `reason` field.
      warnPreserved(ctx, credentialWarning(result.reason), result.reason);
      return;
    case 'unavailable':
      ctx.stats.unavailable += 1;
      // `safeLookup` has already logged this URI with the thrown message;
      // a second line here would just repeat it.
      if (result.reason === 'lookup-threw') return;
      warnPreserved(ctx, 'purchases reconcile owning pillar unavailable', result.reason);
      return;
  }
}

export interface RunLegContext {
  db: PurchasesDb;
  leg: ReconcileLeg;
  lookups: ReconcileLookups;
  logger: ReconcileWorkerLogger | undefined;
  now: () => Date;
}

function shapeMatches(parsed: ParsedUri | null, leg: ReconcileLeg): parsed is ParsedUri {
  return (
    parsed !== null && parsed.pillar === leg.expectedPillar && parsed.type === leg.expectedType
  );
}

/**
 * Walk one leg's distinct URIs, sequentially. A URI whose shape does not
 * match the leg is never probed — probing it would ask the wrong pillar a
 * question about someone else's id — so it is counted as a bad URI, logged
 * for ops, and its row preserved.
 *
 * The leg reports its own line before returning, so an empty leg is visible
 * in the nightly log rather than disappearing into the tick totals.
 */
export async function runLeg(ctx: RunLegContext): Promise<ReconcileLegStats> {
  const { db, leg, logger } = ctx;
  const lookup = leg.lookup(ctx.lookups);
  const uris = leg.listUris(db);
  const stats: ReconcileLegStats = { leg: leg.label, checked: uris.length, ...emptyCounts() };
  for (const uri of uris) {
    const parsed = parseSoftUri(uri);
    if (!shapeMatches(parsed, leg)) {
      stats.badUri += 1;
      logger?.warn?.('purchases reconcile bad uri (unparseable / wrong shape)', {
        leg: leg.label,
        uri,
      });
      continue;
    }
    const result = await safeLookup(lookup, parsed.id, logger);
    applyResult({ db, leg, uri, nowIso: ctx.now().toISOString(), stats, logger }, result);
  }
  logger?.info?.('purchases reconcile leg complete', { ...stats });
  return stats;
}
