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

export interface ReconcileTickStats {
  resolved: number;
  staleMarked: number;
  badUri: number;
  unavailable: number;
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

interface ReconcileLeg {
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

export function emptyStats(): ReconcileTickStats {
  return { resolved: 0, staleMarked: 0, badUri: 0, unavailable: 0 };
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
  stats: ReconcileTickStats;
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
      ctx.logger?.warn?.('purchases reconcile bad uri (preserved for ops)', {
        ...legMeta(ctx),
        reason: result.reason,
      });
      return;
    case 'unavailable':
      ctx.stats.unavailable += 1;
      // `safeLookup` has already logged the throw with its stack detail.
      if (result.reason === 'lookup-threw') return;
      ctx.logger?.warn?.('purchases reconcile owning pillar unavailable', {
        ...legMeta(ctx),
        reason: result.reason,
      });
      return;
  }
}

export interface RunLegContext {
  db: PurchasesDb;
  leg: ReconcileLeg;
  lookups: ReconcileLookups;
  stats: ReconcileTickStats;
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
 */
export async function runLeg(ctx: RunLegContext): Promise<void> {
  const { db, leg, stats, logger } = ctx;
  const lookup = leg.lookup(ctx.lookups);
  for (const uri of leg.listUris(db)) {
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
}
