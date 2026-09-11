/**
 * Collapses one leg's `unavailable` warnings into a single line when the
 * whole leg is unavailable, split out of `reconcile-legs.ts` to keep that
 * file under its line budget.
 */
import type { ReconcileCounts, ReconcileLeg, ReconcileWorkerLogger } from './reconcile-types.js';

/** One URI whose `unavailable` warning was withheld until the leg finishes. */
export interface PendingUnavailable {
  uri: string;
  reason: string;
}

/**
 * A leg where every URI came back `unavailable` is almost always one fact —
 * the owning pillar is down, or unreachable by design (Paperless unconfigured
 * answers every document with 412) — so it gets one summary line instead of
 * one per URI. A leg with any resolved or stale-marked URI mixed in still
 * warns per URI: that mix genuinely is per-URI information, since it means
 * some references are fine and this one specifically is not. The summary
 * counts each distinct reason, so an outage with more than one cause is not
 * reported as if it had only the first.
 */
export function warnUnavailable(
  leg: ReconcileLeg,
  stats: ReconcileCounts,
  pending: readonly PendingUnavailable[],
  logger: ReconcileWorkerLogger | undefined
): void {
  if (pending.length === 0) return;
  if (stats.resolved > 0 || stats.staleMarked > 0) {
    for (const { uri, reason } of pending) {
      logger?.warn?.('purchases reconcile owning pillar unavailable', {
        leg: leg.label,
        uri,
        reason,
      });
    }
    return;
  }
  logger?.warn?.('purchases reconcile owning pillar unavailable (summary)', {
    leg: leg.label,
    count: pending.length,
    reasons: countByReason(pending),
  });
}

function countByReason(pending: readonly PendingUnavailable[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const { reason } of pending) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
