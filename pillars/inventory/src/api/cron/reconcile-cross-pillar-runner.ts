/**
 * Generic per-URI reconciliation loop shared by the inventory cron's
 * purchase-transaction + owner walkers. Lives in a sibling file so the outer
 * cron stays under the file-size lint budget.
 */
import type { InventoryDb } from '../../db/index.js';

export interface ReconcileLogger {
  info?: (msg: string, meta?: Record<string, unknown>) => void;
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
}

interface ParsedUri {
  pillar: string;
  type: string;
  id: string;
}

interface MutableCounters {
  ok: number;
  notFound: number;
  unavailable: number;
  badUri: number;
  misconfigured: number;
}

type ReconcileOutcome = 'ok' | 'not-found' | 'unavailable' | 'bad-request' | 'misconfigured';

export interface ReconcileBatch {
  db: InventoryDb;
  logger: ReconcileLogger | undefined;
  counters: MutableCounters;
  uris: readonly string[];
  expectedPillar: string;
  expectedType: string;
  parse: (uri: string) => ParsedUri | null;
  probe: (parsed: ParsedUri, uri: string) => Promise<ReconcileOutcome>;
  onOk: (uri: string) => void;
  onNotFound: (uri: string) => void;
}

function isShapeMatch(
  parsed: ParsedUri | null,
  expectedPillar: string,
  expectedType: string
): boolean {
  return parsed !== null && parsed.pillar === expectedPillar && parsed.type === expectedType;
}

function applyOk(batch: ReconcileBatch, uri: string): void {
  batch.onOk(uri);
  batch.counters.ok += 1;
}

function applyNotFound(batch: ReconcileBatch, uri: string): void {
  batch.onNotFound(uri);
  batch.counters.notFound += 1;
  batch.logger?.info?.('inventory cross-pillar reconciliation: uri 404', { uri });
}

function applyUnavailable(batch: ReconcileBatch, uri: string): void {
  batch.counters.unavailable += 1;
  batch.logger?.warn?.('inventory cross-pillar reconciliation: owning pillar unavailable', {
    uri,
  });
}

function applyBadRequest(batch: ReconcileBatch, uri: string): void {
  batch.counters.badUri += 1;
  batch.logger?.warn?.('inventory cross-pillar reconciliation: bad uri (parsed, pillar rejected)', {
    uri,
  });
}

function applyMisconfigured(batch: ReconcileBatch, uri: string): void {
  batch.counters.misconfigured += 1;
  batch.logger?.warn?.(
    'inventory cross-pillar reconciliation: owning pillar misconfigured (credential or contract fault, will not heal by retrying)',
    { uri }
  );
}

const OUTCOME_HANDLERS: Record<ReconcileOutcome, (batch: ReconcileBatch, uri: string) => void> = {
  ok: applyOk,
  'not-found': applyNotFound,
  unavailable: applyUnavailable,
  'bad-request': applyBadRequest,
  misconfigured: applyMisconfigured,
};

function applyOutcomeToBatch(batch: ReconcileBatch, uri: string, outcome: ReconcileOutcome): void {
  OUTCOME_HANDLERS[outcome](batch, uri);
}

export async function reconcileUriBatch(batch: ReconcileBatch): Promise<void> {
  for (const uri of batch.uris) {
    const parsed = batch.parse(uri);
    if (!isShapeMatch(parsed, batch.expectedPillar, batch.expectedType)) {
      batch.counters.badUri += 1;
      batch.logger?.warn?.(
        'inventory cross-pillar reconciliation: bad uri (unparseable / wrong shape)',
        { uri }
      );
      continue;
    }
    const outcome = await batch.probe(parsed as ParsedUri, uri);
    applyOutcomeToBatch(batch, uri, outcome);
  }
}
