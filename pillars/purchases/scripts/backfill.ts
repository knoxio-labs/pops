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
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

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
 * Loopback hostnames a `new URL(...).hostname` can produce. IPv6's `::1`
 * comes back bracketed, `[::1]`, because that is how a URL's authority
 * disambiguates the address's own colons from the port separator.
 */
const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '[::1]']);

/** `127.0.0.0/8`: matched by shape, then every octet is range-checked. */
const LOOPBACK_IPV4_RE = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u;

/**
 * Whether `baseUrl` names a host on this machine.
 *
 * Loopback only — `localhost`, `127.0.0.0/8`, `::1` — because that is the
 * one class of address guaranteed to reach the same filesystem the CLI's
 * receipt store just wrote to. Compared as a whole hostname, never as a
 * substring: `localhost.example.com` contains "localhost" but is a distinct,
 * real, remote host, and a substring test would wave through exactly the
 * mistake this exists to catch.
 *
 * An unparsable value is treated as remote rather than thrown on: `new URL`
 * rejects it, and a string that is not even a URL is not one this function
 * can vouch for as local.
 */
export function isLocalBaseUrl(baseUrl: string): boolean {
  let hostname: string;
  try {
    ({ hostname } = new URL(baseUrl));
  } catch {
    return false;
  }

  if (LOOPBACK_HOSTNAMES.has(hostname)) return true;

  const ipv4 = LOOPBACK_IPV4_RE.exec(hostname);
  return ipv4 !== null && ipv4.slice(1).every((octet) => Number(octet) <= 255);
}

/**
 * Resolve the ingest target from the environment.
 *
 * @param env Process environment to read; injectable for tests.
 * @throws When no key is configured. Deliberately fatal rather than
 *   defaulting to an anonymous call: an anonymous backfill is admitted today,
 *   so falling back would silently exempt the CLI from the gate it is meant to
 *   pass, and would keep working right up until `requireCredential` flips.
 * @throws When the resolved base URL is not local (POPS-2312). The CLI's
 *   receipt store (`resolveReceiptStoreRoot`) always writes to a directory on
 *   THIS host; a backfill that posts to a remote server anyway would store
 *   the bytes here and record their URI there, silently orphaning the
 *   evidence — the failure was only visible later, when someone tried to
 *   open an invoice the database swore existed. Refusing here, before the
 *   bundle is even read, turns that into an error the operator sees
 *   immediately.
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
  const rawBaseUrl = env['PURCHASES_BASE_URL']?.trim() ?? '';
  const baseUrl = rawBaseUrl === '' ? DEFAULT_BASE_URL : rawBaseUrl;
  if (!isLocalBaseUrl(baseUrl)) {
    throw new Error(
      `PURCHASES_BASE_URL (${baseUrl}) is not local: refusing to run. The receipt store writes ` +
        'bytes to a directory on this host, so posting to a remote server would store the ' +
        'evidence here and its URI there, and every document would silently fail to resolve. ' +
        'Run the backfill on the host that mounts the purchases volume, or point ' +
        'PURCHASES_BASE_URL at a loopback address (localhost, 127.0.0.0/8, ::1).'
    );
  }
  return { apiKey, baseUrl };
}

/**
 * The one place a backfill request is built, so the credential cannot be
 * dropped from one call site and kept on another.
 *
 * Exported for the attach half (`attach-documents.ts`), which is a separate
 * file only because this one is at its line budget — a second `fetch` there
 * would be a second chance to forget the header.
 *
 * A `GET` carries no body: `fetch` rejects a request that has one on that
 * verb, so the key is left off the init entirely rather than set to
 * `undefined`.
 */
export function ingestFetch(
  client: IngestClient,
  path: string,
  method: 'GET' | 'POST' | 'PUT',
  body?: unknown
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json', [SERVICE_ACCOUNT_HEADER]: client.apiKey },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return fetch(`${client.baseUrl}${path}`, init);
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
   *
   * Null declares no pattern, which blocks nothing — different from
   * declaring one that matches nothing, and the right answer for a source
   * whose charges reach the bank under names a single LIKE cannot cover.
   */
  readonly descriptorPattern: string | null;
  /** Per-source override of the pillar's default matching window, in days. */
  readonly settlementWindowDays?: number;
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

/**
 * A 401/403 from `/purchases` means the account cannot write purchases at
 * all — every subsequent request in the run is known to fail before it is
 * sent, unlike a per-order rejection which says nothing about the next
 * order. `postPurchases` throws this instead of adding to `failures` so the
 * run stops rather than repeating the same failure for every remaining
 * order.
 */
export class AuthFailureError extends Error {
  /**
   * @param status The status that stopped the run, 401 or 403.
   * @param outcome What the run had already done when it stopped. A backfill
   *   is not transactional, and the orders it skipped and the ones it failed
   *   on are as much a part of that as the ones it wrote.
   */
  constructor(
    readonly status: number,
    readonly outcome: BackfillOutcome
  ) {
    super(
      `stopping: the service account is not authorised to write purchases (${String(status)}). ` +
        `${String(outcome.created)} order(s) were written and ${String(outcome.skipped)} were ` +
        'already present before this happened; grant the account purchases.source and ' +
        'purchases.purchase, then re-run — an order already written comes back as a 409 and is ' +
        'skipped.'
    );
    this.name = 'AuthFailureError';
  }
}

/**
 * A 503 from `/purchases` means the scope gate could not verify the
 * credential at all — `libs/pillar-express/src/service-account-scope-gate.ts`
 * returns exactly this status, with exactly this message, for one reason
 * only: the registry it checks the account against is unreachable. That is
 * account-level and transient, unlike a per-order rejection: nothing about
 * the next order makes it likelier to succeed, but nothing about the account
 * is actually wrong either, so the remedy is "retry once the registry is
 * up", not "widen the grant" (that is {@link AuthFailureError}'s advice, and
 * would be wrong here). `postPurchases` stops on the first 503 rather than
 * waiting for a run of them: this script has no retry or backoff between
 * requests, so riding out a blip would mean burning through the rest of the
 * bundle against a dependency already known to be down.
 */
export class RegistryUnavailableError extends Error {
  /**
   * @param outcome What the run had already done when it stopped. A backfill
   *   is not transactional, and the orders it skipped and the ones it failed
   *   on are as much a part of that as the ones it wrote.
   */
  constructor(readonly outcome: BackfillOutcome) {
    super(
      'stopping: the registry is unreachable, so the service-account credential could not be ' +
        `verified (503). ${String(outcome.created)} order(s) were written and ` +
        `${String(outcome.skipped)} were already present before this happened; check that the ` +
        'registry and the purchases pillar are up, then re-run — an order already written comes ' +
        'back as a 409 and is skipped.'
    );
    this.name = 'RegistryUnavailableError';
  }
}

/**
 * Hooks for a caller whose purchases reference something outside the request.
 *
 * A purchase can name a file the request does not carry — an invoice URI that
 * has to resolve to bytes on the volume. Those bytes must exist before the row
 * that points at them, and must not be left behind when no row is written, so
 * the caller needs both edges of each request rather than the totals.
 *
 * A run can also end part-way through: {@link AuthFailureError} and
 * {@link RegistryUnavailableError} leave the purchases after the stop with
 * neither hook called, so a caller that acts on `beforeRequest` has to
 * reconcile what it did when the call throws as well as when it returns.
 */
export interface PostPurchaseHooks {
  /** Before the request is made. */
  readonly beforeRequest?: (purchase: CreatePurchaseInput) => void;
  /** After a 201, and only a 201. */
  readonly afterCreated?: (purchase: CreatePurchaseInput) => void;
}

export async function postPurchases(
  client: IngestClient,
  purchases: readonly CreatePurchaseInput[],
  hooks: PostPurchaseHooks = {}
): Promise<BackfillOutcome> {
  let created = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const purchase of purchases) {
    hooks.beforeRequest?.(purchase);
    const response = await ingestFetch(client, '/purchases', 'POST', purchase);

    if (response.status === 201) {
      created += 1;
      hooks.afterCreated?.(purchase);
    }
    // A checksum or (source, orderId) that already exists. Re-running a
    // backfill is expected, so this is the normal path, not an error.
    else if (response.status === 409) skipped += 1;
    else if (response.status === 401 || response.status === 403) {
      throw new AuthFailureError(response.status, { created, skipped, failures });
    } else if (response.status === 503) {
      throw new RegistryUnavailableError({ created, skipped, failures });
    } else {
      failures.push(
        `${purchase.sourceOrderId ?? '?'} -> ${String(response.status)} ${await response.text()}`
      );
    }
  }

  return { created, skipped, failures };
}

/**
 * Read the bundle root out of a CLI's arguments.
 *
 * @param argv Arguments after the script name.
 * @param command The `pnpm` script to name in the usage message.
 * @throws When no non-flag argument was given.
 */
export function readBundlePath(argv: readonly string[], command: string): string {
  const bundlePath = argv.find((arg) => !arg.startsWith('--'));
  if (bundlePath === undefined) {
    throw new Error(
      `usage: pnpm ${command} -- "<bundle-root>" [--dry-run]\n` +
        '<bundle-root> is the unzipped DSAR bundle: the directory CONTAINING ' +
        '"Your Amazon Orders", not that folder itself.'
    );
  }
  return bundlePath;
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

/**
 * Whether the module at `moduleUrl` is the file the process was started with,
 * so importing a CLI's `main` for a test does not also run the CLI.
 *
 * Both sides are normalised before comparison. Interpolating the entry path
 * into `file://` instead compares an unencoded path against the percent-encoded
 * URL `import.meta.url` always is, so any entry path containing a space, `#`,
 * `?` or a non-ASCII character fails to match and the CLI silently does
 * nothing — a checkout under `~/My Projects` is enough.
 *
 * @param moduleUrl The calling module's `import.meta.url`.
 * @param entryPath The process entry path; injectable for tests.
 */
export function isCliEntrypoint(
  moduleUrl: string,
  entryPath: string | undefined = process.argv[1]
): boolean {
  if (entryPath === undefined || entryPath === '') return false;
  return moduleUrl === pathToFileURL(resolve(entryPath)).href;
}

/**
 * Run a CLI's `main`, printing a failure as a one-line message rather than
 * letting it surface as an unhandled rejection with a stack trace — the
 * shape every failure in these scripts should have, config errors included.
 *
 * A run stopped by {@link AuthFailureError} or {@link RegistryUnavailableError}
 * reports what it had already done first. An ingest CLI reports through
 * `reportOutcome(await postPurchases(...))`, so a throw skips that call and
 * the counts and failure lines collected before the stop would otherwise be
 * lost with it.
 */
export async function runCli(main: () => Promise<void> | void): Promise<void> {
  try {
    await main();
  } catch (error) {
    if (error instanceof AuthFailureError || error instanceof RegistryUnavailableError) {
      reportOutcome(error.outcome);
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
