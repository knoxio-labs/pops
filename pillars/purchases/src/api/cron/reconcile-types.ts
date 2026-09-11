/**
 * Vocabulary shared between `reconcile-legs.ts` and `reconcile-unavailable.ts`.
 *
 * Lives here, rather than in either of those files, because both need it
 * and neither may import the other's non-type exports without forming a
 * cycle: `reconcile-legs.ts` calls `warnUnavailable`, and
 * `warnUnavailable` takes a leg and its stats as arguments. A leaf module
 * with no imports from either sibling is the only shape that satisfies
 * both.
 */
import type { PurchasesDb } from '../../db/index.js';

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

/** One column's worth of reconciliation. Constructed only as a row in `LEGS`. */
export interface ReconcileLeg {
  readonly label: string;
  readonly expectedPillar: string;
  readonly expectedType: string;
  readonly listUris: (db: PurchasesDb) => string[];
  readonly markStale: (db: PurchasesDb, uri: string, nowIso: string) => number;
  readonly clearStale: (db: PurchasesDb, uri: string) => number;
  readonly lookup: (lookups: ReconcileLookups) => ReconcileLookupFn;
}
