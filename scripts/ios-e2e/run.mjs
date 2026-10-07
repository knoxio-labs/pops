#!/usr/bin/env node
/**
 * Boots the federation the iOS app's Maestro flows need, then drives them.
 *
 * The app is pointed at a **real** `@pops/bfm` process — real pairing codes,
 * real ECDSA key parsing, real access tokens, real SQLite, real keyset paging —
 * against a temporary database that this script creates and deletes. What sits
 * behind the BFM (the registry snapshot and the finance pillar it proxies to)
 * is `upstream-stub.mjs`; that file argues for itself. The one exception is
 * inventory, which is the real pillar on its own temporary database behind a
 * gate (`inventory-pillar.mjs`, which says why).
 *
 * ## Why this lives at the repo root and not in `clients/ios`
 *
 * [ADR-043](../../docs/architecture/adr-043-clients-as-a-unit-kind.md): a client
 * consumes the federation over HTTP and never reaches into a pillar's
 * directory. Building and running `@pops/bfm` is reaching in, so it happens
 * here — the same split as `fixture:device-signature` in the root `mise.toml`,
 * which owns the copy step neither unit may perform on the other. The
 * `clients/ios` half of this (`mise -C clients/ios run e2e`) is handed two base
 * URLs and speaks nothing but HTTP to either.
 *
 * ## There is no Docker here, deliberately
 *
 * GitHub's macOS runners ship no Docker daemon, so `infra/docker-compose.dev.yml`
 * — the obvious way to get a BFM — cannot run in the job this flow is gated by.
 * The pillar is a Node process and starts in about a second; `pnpm --filter
 * @pops/bfm... build` then `node pillars/bfm/dist/api/server.js` is the whole
 * of it.
 *
 * ## Why the port is not 3014
 *
 * `clients/ios/project.yml` points the Debug build at `http://localhost:3014`,
 * which is also where `cd pillars/bfm && pnpm dev` listens — so a developer
 * with their own stack up would run this harness against their BFM instead of
 * against a temporary one, and the first symptom is a flow that fails on an
 * empty transactions list twenty minutes later. That is not hypothetical: it
 * happened while this file was being written, to a `pnpm dev` process left
 * running in a sibling worktree the day before.
 *
 * So this binds a free port. The host control plane delivers pairing through
 * the Debug-simulator-only URL route, keeping the code out of Maestro's
 * process, logs and artifacts while still exercising the real BFM pairing
 * exchange.
 *
 * The `/health` identity check below is the belt to that brace: a port can be
 * taken between this process choosing it and the pillar binding it, and a
 * stranger answering `/health` looks exactly like success.
 *
 * ## The second origin
 *
 * `control-plane.mjs` listens on a port of its own and forwards everything that
 * is not `/__e2e/` to the pillar. The recovery flows pair against it, because
 * each of them needs something to change mid-run — a token aged past its
 * expiry, finance refusing to answer — and an HTTP endpoint is the only thing a
 * Maestro flow can reach outside the phone. The happy path can obtain its
 * pairing code directly from BFM or through the real MCP gateway, selected
 * with `--pairing-issuer`.
 *
 * Usage:
 *   node scripts/ios-e2e/run.mjs                         run every flow, then tear everything down
 *   node scripts/ios-e2e/run.mjs --pairing-issuer=mcp     run the MCP pairing path
 *   node scripts/ios-e2e/run.mjs --serve-only             pair the selected simulator and keep servers up
 *   POPS_IOS_E2E_SIMULATOR_UDID=<id> node scripts/ios-e2e/run.mjs
 *
 * Exit 0 = the flow passed. Exit 1 = it did not, or the federation would not
 * come up. Exit 2 = usage error.
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { seededAccounts } from './accounts-fixture.mjs';
import { startControlPlane } from './control-plane.mjs';
import { spawnInventoryPillar, startInventoryGate } from './inventory-pillar.mjs';
import { publishUserDefinedType } from './inventory-user-type.mjs';
import {
  createMcpInboundAuth,
  hasPairingCodeIssuerTool,
  isMcpReadyResponse,
} from './mcp-pairing-code.mjs';
import {
  formatPairingRunLifecycleSummary,
  PairingArtifactScanFailure,
  primaryPairingRunFailure,
  scanPairingArtifacts,
} from './pairing-artifact-guard.mjs';
import { createPairingHandoff } from './pairing-handoff.mjs';
import { createProcessRunner } from './process-runner.mjs';
import { startPurchasesStub } from './purchases-stub.mjs';
import { formatServeOnlyStatus, pairSimulatorForServeOnly } from './serve-only-pairing.mjs';
import { boundAddress } from './server-address.mjs';
import { issueAndOpenPairingLink } from './simulator-pairing.mjs';
import { hasLocalHarnessOrigins, readDisposableSimulator } from './simulator-target.mjs';
import { seededTransactions } from './transactions-fixture.mjs';
import { startUpstreamStub } from './upstream-stub.mjs';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const HOST = '127.0.0.1';

/**
 * How long to wait for the BFM to answer its health route.
 *
 * A process start, not a user-visible wait, and polled rather than slept
 * through — the first successful probe wins, so the normal cost is the second
 * or so the pillar takes to migrate a new database. The ceiling exists only so
 * a pillar that crashed at boot is reported as such instead of hanging the job
 * until its 45-minute timeout.
 */
const BOOT_TIMEOUT_MS = 30_000;

/** The key the BFM presents to other pillars, and the one the registry stub answers for. */
const SERVICE_ACCOUNT_KEY = 'ios-e2e-service-account-key';
const BOOT_POLL_MS = 100;

/** How long the pillar gets to shut down cleanly before it is killed. */
const SHUTDOWN_GRACE_MS = 5_000;
/** @type {ReturnType<typeof createProcessRunner> | undefined} */
let processRunner;

/**
 * @type {{
 *   phase: 'preflight' | 'fixtures' | 'bfm-startup' | 'mcp-startup' | 'mcp-readiness' | 'ios-e2e' | 'artifact-scan' | 'complete',
 *   issuedCount: number,
 *   claimedCount: number,
 *   completedCount: number,
 *   pairedCount: number,
 *   scannedRoots: number,
 *   totalRoots: number,
 *   scannedFiles: number,
 *   artifactScan: 'not-run' | 'clean' | 'matched' | 'failed',
 *   artifactScanStage: 'required-root-missing' | 'required-root-no-new-files' | 'root-read-failed' | 'file-stat-failed' | 'file-read-failed' | 'unknown' | null
 * }}
 */
let pairingLifecycle = {
  phase: 'preflight',
  issuedCount: 0,
  claimedCount: 0,
  completedCount: 0,
  pairedCount: 0,
  scannedRoots: 0,
  totalRoots: 2,
  scannedFiles: 0,
  artifactScan: 'not-run',
  artifactScanStage: null,
};
let pairingLifecycleSummaryPrinted = false;

function reportPairingLifecycleFailure() {
  if (pairingLifecycleSummaryPrinted) return;
  pairingLifecycleSummaryPrinted = true;
  process.stderr.write(formatPairingRunLifecycleSummary(pairingLifecycle));
}

/** Satisfies the BFM's boot check, which refuses anything under 32 characters. */
const ACCESS_TOKEN_SECRET = 'ios-e2e-access-token-secret-not-a-real-key';

/**
 * Raises `POST /operator/pairing/codes`'s issuance budget for this run only.
 *
 * `pillars/bfm/src/api/rate-limit.ts` caps that at 5 per operator per 15
 * minutes in production — a security control, not a convenience default. This
 * harness runs every UI flow against ONE long-lived BFM process under the
 * SAME operator identity (`NODE_ENV=test`'s dev-fallback), and each flow mints
 * exactly one code, so the production budget caps this run at five flows
 * regardless of how many `.maestro/*.yaml` files exist — the sixth flow's own
 * mint answers 429, which reads as a broken flow rather than as what it is: a
 * security control doing its job against a caller it was never meant to
 * throttle. `resolvePairingCodeIssuanceLimit` in
 * `pillars/bfm/src/api/boot-env.ts` is the one place production reads this
 * variable; every real deployment leaves it unset.
 */
const PAIRING_CODE_ISSUANCE_LIMIT = 50;

/**
 * Raises the discovery cache's per-fetch abort deadline past the SDK's own
 * default of 5s (`DEFAULT_FETCH_TIMEOUT_MS` in `libs/sdk/src/discovery/fetcher.ts`),
 * for the same reason `PAIRING_CODE_ISSUANCE_LIMIT` above raises a production
 * budget: this run is not what the default was sized for.
 *
 * The BFM's `@pops/pillar-sdk` discovery client polls `upstream.url` —
 * `upstream-stub.mjs`'s registry route — on a background timer for as long as
 * this process runs, not just once at boot. That poll is a loopback HTTP
 * round trip between two Node processes sharing this runner's three cores
 * with `xcodebuild`, the booted simulator and Maestro's own driver, and
 * `pairing-to-transaction-detail.yaml`'s own comment on why it asserts the
 * degraded banner absent records the failure mode directly: the fetch aborts
 * under that contention even though the stub answered, the cache falls back
 * to serving its last-known-good snapshot as stale, and the app draws "Some
 * of Pops could not be reached" — correctly, for a registry that genuinely
 * missed its deadline. That is the same starvation class that forced `-j 1`
 * onto `ios-quality.yml`'s SwiftLint-analyzer step, and a retry here would
 * hide a real signal rather than fix a slow one, so this raises the budget
 * instead: 4x the production default, chosen to absorb scheduling jitter on a
 * loaded CI host without masking an actual registry outage inside a single
 * flow's run. `resolveDiscoveryFetchTimeoutMs` in
 * `pillars/bfm/src/api/pillars/env.ts` is the one place production reads this
 * variable; every real deployment leaves it unset.
 */
const DISCOVERY_FETCH_TIMEOUT_MS = 20_000;

/**
 * Raises the registry-backed service-account verification deadline past the
 * SDK's production default of 3s. The pairing request crosses the MCP, BFM
 * and registry processes while xcodebuild, the simulator and Maestro share
 * the same loaded CI runner; without a bounded harness override, scheduling
 * delay is reported as registry unavailability. `resolveServiceAccountVerifyTimeoutMs`
 * in `pillars/bfm/src/api/pillars/env.ts` is the one place BFM reads this
 * variable; every real deployment leaves it unset.
 */
const SERVICE_ACCOUNT_VERIFY_TIMEOUT_MS = 30_000;

/**
 * Raises the reachability probe's per-pillar `GET /openapi` deadline past
 * `reachability.ts`'s own default of 2s (`DEFAULT_PROBE_TIMEOUT_MS`), for the
 * same reason `DISCOVERY_FETCH_TIMEOUT_MS` above raises the discovery
 * deadline: the probe is a second loopback fetch from the same BFM process
 * to the same `upstream-stub.mjs`, racing the same three-core contention —
 * and the tighter of the two deadlines, so at least as exposed to it. Unlike
 * discovery, no CI run has actually missed this one yet; this raises it
 * anyway, on the same 4x-the-production-default reasoning, rather than wait
 * for a flake to prove the exposure is real. `resolveProbeTimeoutMs` in
 * `pillars/bfm/src/api/pillars/env.ts` is the one place production reads this
 * variable; every real deployment leaves it unset.
 */
const PROBE_TIMEOUT_MS = 8_000;

class HarnessError extends Error {}

/**
 * A port nothing is listening on, right now.
 *
 * Inherently a claim about the past by the time the pillar binds it, which is
 * why {@link waitForHealth} checks who answered rather than that anyone did.
 *
 * @returns {Promise<number>}
 */
function allocatePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, HOST, () => {
      const { port } = boundAddress(probe, 'ios-e2e');
      probe.close(() => resolve(port));
    });
  });
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} options
 * @returns {Promise<void>}
 */
function run(command, args, options = {}) {
  if (processRunner === undefined) throw new HarnessError('the process runner is not ready.');
  return processRunner
    .run(command, args, { cwd: REPO_ROOT, ...options })
    .then(({ code, signal }) => {
      if (code === 0) return;
      throw new HarnessError(`${command} ${args.join(' ')} ${describeEnd(code, signal)}`);
    });
}

function throwIfStopping() {
  const signal = processRunner?.signal();
  if (signal !== null && signal !== undefined) {
    throw new HarnessError(`the iOS E2E was stopped by ${signal}.`);
  }
}

/**
 * How a child process ended, in words.
 *
 * `code` is null whenever a signal ended the process, so reporting the code
 * alone turns every kill into "exited null" — which is the shape a CI failure
 * arrives in, and the one where the signal is the whole diagnosis: SIGKILL is
 * an out-of-memory runner, SIGTERM is a cancelled job, SIGSEGV is something
 * else entirely.
 *
 * @param {number | null} code
 * @param {NodeJS.Signals | null} signal
 * @returns {string}
 */
function describeEnd(code, signal) {
  if (signal !== null) return `was killed by ${signal}`;
  if (code !== null) return `exited ${code}`;
  // Node documents one of the two as always present. If that ever stops being
  // true, say so rather than printing "null".
  return 'ended with neither an exit code nor a signal';
}

/**
 * Polls until the BFM this harness started answers — and refuses anything else
 * that does.
 *
 * The pillar reports `BUILD_VERSION` on `/health`, so a value minted here and
 * nowhere else is proof of identity. Without it, a BFM already listening on the
 * chosen port satisfies every probe: pairing works, the app pairs, and the
 * flow then fails on a transactions list that is empty because that pillar
 * discovers the real registry rather than this harness's fixture. Everything
 * about that failure points at the flow and none of it is the flow's fault.
 *
 * Watching the child matters for the same reason the ceiling does not: a pillar
 * that crashes on a bad secret exits in milliseconds, and polling a dead port
 * for thirty seconds would blame the timeout.
 *
 * @param {URL} baseURL
 * @param {string} expectedVersion
 * @param {import('node:child_process').ChildProcess} child
 * @param {string} [who] Names the process in a failure, since two pillars boot here.
 */
async function waitForHealth(baseURL, expectedVersion, child, who = 'the BFM') {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  const health = new URL('/health', baseURL);

  while (Date.now() < deadline) {
    throwIfStopping();
    // Both are null while it runs, and exactly one is set once it has not —
    // a pillar killed by a signal has no exit code, so watching the code alone
    // would poll a dead port until the ceiling.
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new HarnessError(
        `${who} ${describeEnd(child.exitCode, child.signalCode)} before answering ${health}. ` +
          'Its output is above.'
      );
    }
    const answer = await probeHealth(health);
    if (answer.kind === 'version' && answer.version === expectedVersion) return;
    if (answer.kind === 'version') {
      throw new HarnessError(
        `something else is already serving ${baseURL.origin} — it reports version ` +
          `"${answer.version}", not this harness's "${expectedVersion}". Stop it and run this again.`
      );
    }
    if (answer.kind === 'foreign') {
      throw new HarnessError(
        `something is already serving ${baseURL.origin} and it is not ${who} — ` +
          `${health} answered 2xx with ${answer.why}. Stop it and run this again.`
      );
    }
    await sleep(BOOT_POLL_MS);
  }

  throw new HarnessError(`${who} did not answer ${health} within ${BOOT_TIMEOUT_MS}ms`);
}

/**
 * What is on the other end of the health route, in three kinds rather than two.
 *
 * `silent` and `foreign` have to be told apart. Silence is the expected answer
 * for the first few polls and means keep waiting; a 2xx that is not this
 * pillar's health shape means a stranger owns the port, and that will still be
 * true in thirty seconds. Collapsing the second into the first spends the whole
 * boot ceiling and then reports a timeout, which points at the pillar being
 * slow rather than at the process that is actually answering.
 *
 * @param {URL} health
 * @returns {Promise<{ kind: 'version', version: string } | { kind: 'foreign', why: string } | { kind: 'silent' }>}
 */
async function probeHealth(health) {
  /** @type {Response} */
  let response;
  try {
    response = await fetch(health, { signal: AbortSignal.timeout(1000) });
  } catch {
    // Refused, reset or timed out. Nothing is listening yet, which is what the
    // first few polls are for.
    return { kind: 'silent' };
  }

  // A non-2xx is ambiguous on purpose: a pillar mid-boot can answer 503, and so
  // can a proxy in front of something else. Waiting is the cheaper mistake, and
  // the ceiling bounds it.
  if (!response.ok) return { kind: 'silent' };

  /** @type {unknown} */
  let body;
  try {
    body = await response.json();
  } catch {
    return { kind: 'foreign', why: 'a body that is not JSON' };
  }

  const version = /** @type {{ version?: unknown }} */ (body)?.version;
  if (typeof version !== 'string') {
    return { kind: 'foreign', why: 'JSON carrying no `version` string' };
  }
  return { kind: 'version', version };
}

/**
 * Poll the MCP process this harness started until its key-aware readiness
 * route confirms that the tool surface is loaded.
 *
 * @param {URL} baseURL
 * @param {import('node:child_process').ChildProcess} child
 * @param {string} token
 * @returns {Promise<void>}
 */
async function waitForMcpReady(baseURL, child, token) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  const ready = new URL('/ready', baseURL);

  while (Date.now() < deadline) {
    throwIfStopping();
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new HarnessError(
        `the MCP server ${describeEnd(child.exitCode, child.signalCode)} before answering ${ready}. ` +
          'Its output is above.'
      );
    }

    try {
      const response = await fetch(ready, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const body = await response.json();
        if (isMcpReadyResponse(body)) {
          const hasPairingIssuer = await hasPairingCodeIssuerTool({
            endpoint: new URL('/mcp', baseURL).toString(),
            token,
            signal: AbortSignal.timeout(1000),
          });
          if (hasPairingIssuer) return;
        }
      }
    } catch {
      // The process is still starting or the port is not bound yet.
    }
    await sleep(BOOT_POLL_MS);
  }

  throw new HarnessError(`the MCP server did not answer ${ready} within ${BOOT_TIMEOUT_MS}ms`);
}

/**
 * Ends the pillar, and does not wait forever for it to agree.
 *
 * Its `SIGTERM` handler calls `server.close()`, which drains in-flight requests
 * before the callback fires — so a keep-alive socket nobody is using still
 * holds it open. A harness that waited on that would hang until the job's
 * 45-minute ceiling and report a timeout rather than a finished run.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @returns {Promise<void>}
 */
function stop(child) {
  // Already gone, by either route — a process killed by a signal has no exit
  // code, and signalling it again would wait for an `exit` that has been and
  // gone.
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const kill = setTimeout(() => child.kill('SIGKILL'), SHUTDOWN_GRACE_MS);
    child.once('exit', () => {
      clearTimeout(kill);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function main() {
  pairingLifecycle = {
    phase: 'preflight',
    issuedCount: 0,
    claimedCount: 0,
    completedCount: 0,
    pairedCount: 0,
    scannedRoots: 0,
    totalRoots: 2,
    scannedFiles: 0,
    artifactScan: 'not-run',
    artifactScanStage: null,
  };
  pairingLifecycleSummaryPrinted = false;
  const args = process.argv.slice(2);
  const serveOnly = args.includes('--serve-only');
  const issuerArgument = args.find((arg) => arg.startsWith('--pairing-issuer='));
  const pairingIssuer =
    issuerArgument?.slice('--pairing-issuer='.length) ??
    process.env['POPS_E2E_PAIRING_ISSUER'] ??
    'direct';
  const unknown = args.filter(
    (arg) => arg !== '--serve-only' && !arg.startsWith('--pairing-issuer=')
  );
  if (unknown.length > 0) {
    reportPairingLifecycleFailure();
    process.stderr.write(`ios-e2e: unknown argument(s): ${unknown.join(' ')}\n`);
    process.exitCode = 2;
    return;
  }
  if (pairingIssuer !== 'direct' && pairingIssuer !== 'mcp') {
    reportPairingLifecycleFailure();
    process.stderr.write(
      `ios-e2e: unsupported pairing issuer '${pairingIssuer}'. Use direct or mcp.\n`
    );
    process.exitCode = 2;
    return;
  }

  /** @type {{ deviceId: string, name: string } | undefined} */
  let simulatorTarget;
  try {
    simulatorTarget = readDisposableSimulator(process.env['POPS_IOS_E2E_SIMULATOR_UDID']);
  } catch (error) {
    throw new HarnessError(error instanceof Error ? error.message : 'simulator selection failed.');
  }
  pairingLifecycle.phase = 'fixtures';
  const pairingHandoff = createPairingHandoff({ deviceId: simulatorTarget.deviceId });
  /** @type {Array<{ code: string, pairingUrl: string }>} */
  const pairingMaterials = [];
  const artifactScanStartedAt = Date.now() - 5_000;
  const simulatorLogRoot = join(
    homedir(),
    'Library',
    'Logs',
    'CoreSimulator',
    simulatorTarget.deviceId
  );
  const scanCurrentPairingArtifacts = async () => {
    const previousPhase = pairingLifecycle.phase;
    pairingLifecycle.phase = 'artifact-scan';
    const counts = pairingHandoff.readCounts();
    pairingLifecycle.claimedCount = counts.claims;
    pairingLifecycle.completedCount = counts.completions;
    pairingLifecycle.pairedCount = counts.paired;
    /** @type {Awaited<ReturnType<typeof scanPairingArtifacts>>} */
    let result;
    try {
      result = await scanPairingArtifacts({
        root: join(homedir(), '.maestro', 'tests'),
        additionalRoots: [simulatorLogRoot],
        requiredRoots: [join(homedir(), '.maestro', 'tests'), simulatorLogRoot],
        afterMs: artifactScanStartedAt,
        materials: pairingMaterials,
      });
    } catch (error) {
      pairingLifecycle.artifactScan = 'failed';
      pairingLifecycle.scannedFiles =
        error instanceof PairingArtifactScanFailure ? error.scannedFiles : 0;
      pairingLifecycle.scannedRoots =
        error instanceof PairingArtifactScanFailure ? error.scannedRoots : 0;
      pairingLifecycle.totalRoots =
        error instanceof PairingArtifactScanFailure ? error.totalRoots : 2;
      pairingLifecycle.artifactScanStage =
        error instanceof PairingArtifactScanFailure ? error.stage : 'unknown';
      throw new HarnessError(
        `ios-e2e artifact scan failed${error instanceof PairingArtifactScanFailure ? ` at ${error.stage}` : ''}.`
      );
    }
    pairingLifecycle.scannedFiles = result.scannedFiles;
    pairingLifecycle.scannedRoots = result.scannedRoots;
    pairingLifecycle.totalRoots = result.totalRoots;
    if (result.filesWithPairingMaterial > 0) {
      pairingLifecycle.artifactScan = 'matched';
      throw new HarnessError(
        'pairing material was found in a test artifact or simulator log; contents were not printed.'
      );
    }
    pairingLifecycle.artifactScan = 'clean';
    pairingLifecycle.artifactScanStage = null;
    process.stdout.write(
      `ios-e2e: checked issued=${pairingLifecycle.issuedCount} claims=${counts.claims} completions=${counts.completions} paired=${counts.paired} scannedRoots=${result.scannedRoots}/${result.totalRoots} scannedFiles=${result.scannedFiles} matches=${result.filesWithPairingMaterial}.\n`
    );
    pairingLifecycle.phase = previousPhase;
  };

  pairingLifecycle.phase = 'fixtures';
  const port = await allocatePort();
  const baseURL = new URL(`http://${HOST}:${port}`);
  const buildVersion = `ios-e2e-${randomUUID()}`;
  const dataDir = mkdtempSync(join(tmpdir(), 'pops-ios-e2e-'));
  /** @type {Array<() => Promise<void>>} */
  const teardown = [async () => rmSync(dataDir, { recursive: true, force: true })];
  let tornDown = false;
  let succeeded = false;

  /**
   * Every step runs even when one throws. They are independent — a pillar, a
   * socket and a directory — and the one that fails is never a reason to leave
   * the other two behind, least of all a listening port.
   */
  const tearDown = async () => {
    if (tornDown) return;
    tornDown = true;
    try {
      await processRunner?.close();
    } catch (error) {
      process.stderr.write(`ios-e2e: teardown step failed: ${String(error)}\n`);
    }
    for (const step of teardown) {
      try {
        await step();
      } catch (error) {
        process.stderr.write(`ios-e2e: teardown step failed: ${String(error)}\n`);
      }
    }
  };

  processRunner = createProcessRunner({ graceMs: SHUTDOWN_GRACE_MS });

  try {
    // Started before the registry that advertises it, because the address it
    // is advertised at is the port it just bound. It answers nothing until a
    // flow asks it to — see `purchases-stub.mjs`.
    const purchases = await startPurchasesStub({ host: HOST });
    teardown.unshift(purchases.close);
    process.stdout.write(`ios-e2e: purchases stub on ${purchases.url} (withheld until armed)\n`);

    // The real inventory pillar sits behind a gate that withholds it until a
    // flow arms it; `inventory-pillar.mjs` says why. The gate is up before the
    // registry that advertises it, and the pillar after, because the pillar
    // verifies the BFM's key against that registry.
    await run('pnpm', ['--filter', '@pops/inventory...', 'build']);
    const inventoryPort = await allocatePort();
    const inventoryBaseURL = new URL(`http://${HOST}:${inventoryPort}`);
    const inventory = await startInventoryGate({
      pillarBaseUrl: inventoryBaseURL.origin,
      host: HOST,
    });
    teardown.unshift(inventory.close);

    const upstream = await startUpstreamStub({
      rows: seededTransactions,
      accounts: seededAccounts,
      purchasesBaseUrl: purchases.url,
      inventoryBaseUrl: inventory.url,
      bfmBaseUrl: pairingIssuer === 'mcp' ? baseURL.origin : undefined,
      serviceAccountKey: SERVICE_ACCOUNT_KEY,
      host: HOST,
    });
    teardown.unshift(upstream.close);
    process.stdout.write(`ios-e2e: registry + finance stub on ${upstream.url}\n`);

    const inventoryPillar = spawnInventoryPillar({
      repoRoot: REPO_ROOT,
      port: inventoryPort,
      dataDir,
      buildVersion,
      selfBaseUrl: inventoryBaseURL.origin,
      registryUrl: upstream.url,
    });
    teardown.unshift(() => stop(inventoryPillar));
    await waitForHealth(inventoryBaseURL, buildVersion, inventoryPillar, 'the inventory pillar');
    process.stdout.write(
      `ios-e2e: inventory pillar on ${inventoryBaseURL.origin}, gated at ${inventory.url} (withheld until armed)\n`
    );

    // `@pops/bfm...`, not `@pops/bfm`: the pillar's build script runs its
    // OpenAPI generator, which imports the compiled `@pops/contract-openapi`.
    // Nothing else in this job builds the workspace, so the pillar's own
    // dependencies have to be built here — the same reason the Dockerfiles
    // build `@pops/bfm^...` before the pillar.
    pairingLifecycle.phase = 'bfm-startup';
    await run('pnpm', ['--filter', '@pops/bfm...', 'build']);

    const bfm = spawn('node', [join(REPO_ROOT, 'pillars/bfm/dist/api/server.js')], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: String(port),
        BUILD_VERSION: buildVersion,
        BFM_SQLITE_PATH: join(dataDir, 'bfm.db'),
        BFM_SELF_BASE_URL: baseURL.origin,
        BFM_PUBLIC_BASE_URL: baseURL.origin,
        BFM_ACCESS_TOKEN_SECRET: ACCESS_TOKEN_SECRET,
        BFM_PAIRING_CODE_ISSUANCE_LIMIT: String(PAIRING_CODE_ISSUANCE_LIMIT),
        // The BFM crashes at boot without one. The stub ignores the header it
        // ends up on.
        POPS_INTERNAL_API_KEY: SERVICE_ACCOUNT_KEY,
        POPS_REGISTRY_URL: upstream.url,
        POPS_DISCOVERY_FETCH_TIMEOUT_MS: String(DISCOVERY_FETCH_TIMEOUT_MS),
        POPS_SERVICE_ACCOUNT_VERIFY_TIMEOUT_MS: String(SERVICE_ACCOUNT_VERIFY_TIMEOUT_MS),
        POPS_PROBE_TIMEOUT_MS: String(PROBE_TIMEOUT_MS),
        // Emptied on purpose: with it, the pillar would try to register itself
        // with a registry that is a fixture and has no such route.
        POPS_REGISTRY_ENABLED: '',
        // What makes `/operator/pairing/codes` answer without a Cloudflare
        // Access identity. Stated rather than inherited so a shell that
        // happens to export `production` does not silently 401 the seeding
        // step.
        NODE_ENV: 'test',
      },
    });
    teardown.unshift(() => stop(bfm));

    await waitForHealth(baseURL, buildVersion, bfm);
    process.stdout.write(`ios-e2e: bfm on ${baseURL.origin}, database under ${dataDir}\n`);

    const mcpAuth = pairingIssuer === 'mcp' ? createMcpInboundAuth() : undefined;
    /** @type {URL | undefined} */
    let mcpBaseURL;
    if (mcpAuth !== undefined) {
      pairingLifecycle.phase = 'mcp-startup';
      await run('pnpm', ['--filter', '@pops/mcp...', 'build']);
      const mcpPort = await allocatePort();
      mcpBaseURL = new URL(`http://${HOST}:${mcpPort}`);
      const mcp = spawn('node', [join(REPO_ROOT, 'pillars/mcp/dist/index.js')], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'production',
          MCP_PORT: String(mcpPort),
          POPS_API_KEY_FILE: '',
          POPS_INTERNAL_API_KEY: '',
          POPS_API_KEY: SERVICE_ACCOUNT_KEY,
          POPS_BFM_API_URL: baseURL.origin,
          POPS_REGISTRY_URL: upstream.url,
          ...mcpAuth.environment,
        },
      });
      teardown.unshift(() => stop(mcp));
      pairingLifecycle.phase = 'mcp-readiness';
      await waitForMcpReady(mcpBaseURL, mcp, mcpAuth.token);
      process.stdout.write(`ios-e2e: MCP on ${mcpBaseURL.origin}, pairing issuer enabled\n`);
    }

    if (pairingIssuer === 'mcp' && mcpBaseURL === undefined) {
      throw new HarnessError('MCP pairing endpoint is unavailable.');
    }
    const pairingEndpoint =
      pairingIssuer === 'mcp' ? new URL('/mcp', mcpBaseURL).toString() : baseURL.origin;

    pairingLifecycle.phase = 'fixtures';
    const control = await startControlPlane({
      bfmBaseUrl: baseURL.origin,
      accessTokenSecret: ACCESS_TOKEN_SECRET,
      upstream,
      purchases,
      simulatorDeviceId: simulatorTarget?.deviceId,
      pairingHandoff,
      pairSimulator:
        simulatorTarget === undefined || pairingHandoff === undefined
          ? undefined
          : async ({ deviceId, pairingBaseUrl, brokerUrl }) => {
              return issueAndOpenPairingLink({
                issuer: pairingIssuer,
                endpoint: pairingEndpoint,
                pairingBaseUrl,
                brokerUrl,
                handoff: pairingHandoff,
                onPairingIssued: (material) => {
                  pairingMaterials.push(material);
                  pairingLifecycle.issuedCount = pairingMaterials.length;
                },
                token: mcpAuth?.token,
                deviceId,
              });
            },
      inventory: {
        ...inventory,
        // Straight at the pillar, not through the gate: seeding must not
        // depend on whether a flow has armed the feature yet.
        publishUserDefinedType: () =>
          publishUserDefinedType({
            inventoryBaseUrl: inventoryBaseURL.origin,
            apiKey: SERVICE_ACCOUNT_KEY,
          }),
      },
    });
    teardown.unshift(control.close);
    // The same identity check, through the proxy this time. A control plane
    // that forwards nothing looks identical to a healthy one until a flow pairs
    // against it and fails on a screen twenty minutes later; asking it for the
    // BFM's own `/health` proves the whole path before anything is driven.
    await waitForHealth(new URL(control.url), buildVersion, bfm);
    if (!hasLocalHarnessOrigins(baseURL.origin, control.url)) {
      throw new HarnessError('the iOS E2E requires a loopback test BFM and control plane.');
    }
    process.stdout.write(`ios-e2e: control plane on ${control.url}, proxying to the bfm\n`);

    if (serveOnly) {
      pairingLifecycle.phase = 'ios-e2e';
      /** @type {unknown} */
      let pairingError;
      try {
        await pairSimulatorForServeOnly({
          controlUrl: control.url,
          deviceId: simulatorTarget.deviceId,
          handoff: pairingHandoff,
        });
      } catch (error) {
        pairingError = error;
      }
      /** @type {unknown} */
      let artifactScanError;
      try {
        await scanCurrentPairingArtifacts();
      } catch (error) {
        artifactScanError = error;
      }
      if (pairingError !== undefined && artifactScanError !== undefined) {
        pairingLifecycle.phase = 'ios-e2e';
      }
      const primaryError = primaryPairingRunFailure(pairingError, artifactScanError);
      if (primaryError !== undefined) throw primaryError;
      process.stdout.write(
        formatServeOnlyStatus({ bfmUrl: baseURL.origin, controlUrl: control.url })
      );
      await new Promise((resolve) => {
        if (processRunner !== undefined && processRunner.signal() !== null) {
          resolve(undefined);
          return;
        }
        const onInterrupt = () => {
          process.removeListener('SIGTERM', onTerminate);
          resolve(undefined);
        };
        const onTerminate = () => {
          process.removeListener('SIGINT', onInterrupt);
          resolve(undefined);
        };
        process.once('SIGINT', onInterrupt);
        process.once('SIGTERM', onTerminate);
      });
      throwIfStopping();
    }
    /** @type {NodeJS.ProcessEnv} */
    const iosEnv = {
      ...process.env,
      POPS_BFM_BASE_URL: baseURL.origin,
      POPS_E2E_CONTROL_URL: control.url,
      POPS_IOS_E2E_SIMULATOR_UDID: simulatorTarget.deviceId,
    };
    delete iosEnv.MCP_INBOUND_TOKEN;
    delete iosEnv.MCP_INBOUND_TOKEN_FILE;
    delete iosEnv.POPS_MCP_URL;
    pairingLifecycle.phase = 'ios-e2e';
    /** @type {unknown} */
    let flowError;
    try {
      await run('mise', ['-C', 'clients/ios', 'run', 'e2e'], { env: iosEnv });
    } catch (error) {
      flowError = error;
    }
    /** @type {unknown} */
    let artifactScanError;
    try {
      await scanCurrentPairingArtifacts();
    } catch (error) {
      artifactScanError = error;
    }
    if (flowError !== undefined && artifactScanError !== undefined) {
      pairingLifecycle.phase = 'ios-e2e';
    }
    const primaryError = primaryPairingRunFailure(flowError, artifactScanError);
    if (primaryError !== undefined) throw primaryError;
    pairingLifecycle.phase = 'complete';
    succeeded = true;
  } finally {
    const signal = processRunner?.signal();
    if (signal !== null && signal !== undefined) succeeded = false;
    if (
      !succeeded &&
      (pairingLifecycle.issuedCount > 0 || pairingLifecycle.phase === 'ios-e2e') &&
      pairingLifecycle.artifactScan === 'not-run'
    ) {
      try {
        await scanCurrentPairingArtifacts();
      } catch {
        // The lifecycle summary below carries the scan outcome without replacing the run failure.
      }
    }
    if (!succeeded) reportPairingLifecycleFailure();
    await tearDown();
    if (signal === 'SIGINT') process.exitCode = 130;
    if (signal === 'SIGTERM') process.exitCode = 143;
  }
}

try {
  await main();
} catch (error) {
  reportPairingLifecycleFailure();
  if (error instanceof HarnessError) {
    process.stderr.write(`ios-e2e: ${error.message}\n`);
    const signal = processRunner?.signal();
    if (signal === 'SIGINT') process.exitCode = 130;
    else if (signal === 'SIGTERM') process.exitCode = 143;
    else process.exitCode = 1;
  } else {
    throw error;
  }
}
