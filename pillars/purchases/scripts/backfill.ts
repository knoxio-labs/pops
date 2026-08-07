/**
 * The half of a backfill that is the same for every source.
 *
 * Both adapters register a source, then POST orders one at a time through
 * `/purchases` — the same endpoint every other writer uses, so a backfill
 * exercises the real validation, dedup and write path rather than a private
 * shortcut into the database.
 */
import type { CreatePurchaseInput } from '../src/db/services/purchase-input.js';

export const DEFAULT_BASE_URL = 'http://localhost:3013';

export function baseUrlFromEnv(): string {
  return process.env.PURCHASES_BASE_URL ?? DEFAULT_BASE_URL;
}

/** Anomalies are counted by kind: a per-line dump buries the shape of them. */
export function summariseAnomalies(anomalies: readonly { kind: string }[]): string {
  const counts = new Map<string, number>();
  for (const anomaly of anomalies) {
    counts.set(anomaly.kind, (counts.get(anomaly.kind) ?? 0) + 1);
  }
  return [...counts]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([kind, count]) => `${kind}=${String(count)}`)
    .join(' ');
}

export interface SourceRegistration {
  readonly id: string;
  readonly label: string;
  /**
   * A LIKE pattern, not a substring: the trailing `%` is load-bearing.
   * Without it this is an equality test that matches nothing, because no
   * bank descriptor is a bare merchant name. See `src/reconcile/descriptor.ts`.
   */
  readonly descriptorPattern: string;
  readonly autoLinkPolicy: 'auto' | 'review';
  readonly ingestAdapter: string;
}

export async function upsertSource(baseUrl: string, source: SourceRegistration): Promise<void> {
  const { id, ...body } = source;
  const response = await fetch(`${baseUrl}/sources/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `could not register the ${id} source (${String(response.status)}): ${await response.text()}`
    );
  }
}

export interface BackfillOutcome {
  readonly created: number;
  readonly skipped: number;
  readonly failures: readonly string[];
}

export async function postPurchases(
  baseUrl: string,
  purchases: readonly CreatePurchaseInput[]
): Promise<BackfillOutcome> {
  let created = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const purchase of purchases) {
    const response = await fetch(`${baseUrl}/purchases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(purchase),
    });

    if (response.status === 201) created += 1;
    // A checksum or (source, orderId) that already exists. Re-running a
    // backfill is expected, so this is the normal path, not an error.
    else if (response.status === 409) skipped += 1;
    else {
      failures.push(
        `${purchase.sourceOrderId ?? '?'} -> ${String(response.status)} ${await response.text()}`
      );
    }
  }

  return { created, skipped, failures };
}

/** Print the outcome and set a non-zero exit code if anything failed. */
export function reportOutcome(outcome: BackfillOutcome): void {
  console.warn(
    `created ${String(outcome.created)}, skipped ${String(outcome.skipped)}, ` +
      `failed ${String(outcome.failures.length)}`
  );
  for (const failure of outcome.failures.slice(0, 10)) console.error(`  ${failure}`);
  if (outcome.failures.length > 0) process.exitCode = 1;
}
