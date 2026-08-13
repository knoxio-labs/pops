/**
 * The half of a backfill that is the same for every source.
 *
 * Both adapters register a source, then POST orders one at a time through
 * `/purchases` — the same endpoint every other writer uses, so a backfill
 * exercises the real validation, dedup and write path rather than a private
 * shortcut into the database.
 *
 * Every one of those requests carries a service-account key. Purchases admits
 * an uncredentialled caller, so an absent key would ingest anonymously rather
 * than fail — which is why {@link createIngestClient} refuses to build a client
 * without one, and why nothing here takes a bare base URL any more. A caller
 * that presents a key is held to that account's grant (ADR-044), so the
 * account a backfill runs as needs `purchases.source` and `purchases.purchase`
 * or the first request is a 403.
 */
import type { CreatePurchaseInput } from '../src/db/services/purchase-input.js';

export const DEFAULT_BASE_URL = 'http://localhost:3013';

/**
 * The fleet-wide service-account key variable, the same one the server SDK
 * reads (`libs/sdk/src/server/config.ts`).
 */
export const INGEST_API_KEY_ENV = 'POPS_INTERNAL_API_KEY';

/** Where a backfill writes, and who it writes as. */
export interface IngestClient {
  readonly baseUrl: string;
  readonly apiKey: string;
}

/**
 * Resolve the ingest target from the environment.
 *
 * @param env Process environment to read; injectable for tests.
 * @throws When no key is configured. Deliberately fatal rather than
 *   defaulting to an anonymous call: an anonymous backfill is admitted today,
 *   so falling back would silently exempt the CLI from the gate it is meant to
 *   pass, and would keep working right up until `requireCredential` flips.
 */
export function createIngestClient(env: NodeJS.ProcessEnv = process.env): IngestClient {
  const apiKey = env[INGEST_API_KEY_ENV]?.trim() ?? '';
  if (apiKey === '') {
    throw new Error(
      `no service-account key: set ${INGEST_API_KEY_ENV} to a key whose account is granted ` +
        'purchases.source and purchases.purchase. Ingesting without one would write as an ' +
        'anonymous caller, which purchases still admits.'
    );
  }
  const baseUrl = env['PURCHASES_BASE_URL']?.trim() ?? '';
  return { apiKey, baseUrl: baseUrl === '' ? DEFAULT_BASE_URL : baseUrl };
}

/**
 * The one place a backfill request is built, so the credential cannot be
 * dropped from one call site and kept on another.
 */
function ingestFetch(
  client: IngestClient,
  path: string,
  method: 'POST' | 'PUT',
  body: unknown
): Promise<Response> {
  return fetch(`${client.baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-api-key': client.apiKey },
    body: JSON.stringify(body),
  });
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

export async function upsertSource(
  client: IngestClient,
  source: SourceRegistration
): Promise<void> {
  const { id, ...body } = source;
  const response = await ingestFetch(client, `/sources/${id}`, 'PUT', body);
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
  client: IngestClient,
  purchases: readonly CreatePurchaseInput[]
): Promise<BackfillOutcome> {
  let created = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const purchase of purchases) {
    const response = await ingestFetch(client, '/purchases', 'POST', purchase);

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
