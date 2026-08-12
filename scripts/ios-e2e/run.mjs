#!/usr/bin/env node
/**
 * Boots the federation the iOS app's Maestro flows need, then drives them.
 *
 * The app is pointed at a **real** `@pops/bfm` process — real pairing codes,
 * real ECDSA key parsing, real access tokens, real SQLite, real keyset paging —
 * against a temporary database that this script creates and deletes. What sits
 * behind the BFM (the registry snapshot and the finance pillar it proxies to)
 * is `upstream-stub.mjs`; that file argues for itself.
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
 * @pops/bfm build` then `node pillars/bfm/dist/api/server.js` is the whole of
 * it.
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
 * So this binds a free port, and the flow types that address into the pairing
 * form's server field rather than accepting the Debug prefill. Two things
 * follow, both good: two runs on one machine cannot collide, and the flow
 * exercises the manual-entry path — which is the one a simulator has, having no
 * camera to scan a QR with.
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
 * Maestro flow can reach outside the phone. The happy-path flow does not, and
 * still dials the pillar directly.
 *
 * Usage:
 *   node scripts/ios-e2e/run.mjs              run every flow, then tear everything down
 *   node scripts/ios-e2e/run.mjs --serve-only boot the federation, print how to reach it, wait
 *
 * Exit 0 = the flow passed. Exit 1 = it did not, or the federation would not
 * come up. Exit 2 = usage error.
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { startControlPlane } from './control-plane.mjs';
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
const BOOT_POLL_MS = 100;

/** How long the pillar gets to shut down cleanly before it is killed. */
const SHUTDOWN_GRACE_MS = 5_000;

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
 * Raises how long a code minted for this run stays redeemable, past the
 * production default of five minutes (`pillars/bfm/src/db/services/pairing-
 * codes.ts`'s `DEFAULT_PAIRING_CODE_TTL_MS`).
 *
 * A code is minted here and handed to a FRESH `maestro test` invocation — see
 * `clients/ios/mise.toml`'s `e2e` task, which mints one right before starting
 * Maestro for that flow. Installing Maestro's own XCTest driver and settling
 * the simulator both happen after the code already exists and before the
 * flow's first step runs, so on a slow CI host that overhead alone can spend
 * the five-minute default before the app ever submits the code. The pillar
 * cannot tell an expired code from a wrong one — `redeemPairingCode`'s own
 * doc comment says why — so the failure reads as a rejected pairing on the
 * pairing screen rather than as what it is: driver startup, not app or BFM
 * behaviour, eating the code's window. `resolvePairingCodeTtlMs` in
 * `pillars/bfm/src/api/boot-env.ts` is the one place production reads this
 * variable; every real deployment leaves it unset.
 */
const PAIRING_CODE_TTL_MS = 30 * 60 * 1000;

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
      const { port } = probe.address();
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
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd: REPO_ROOT, ...options });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) return resolve();
      reject(new HarnessError(`${command} ${args.join(' ')} ${describeEnd(code, signal)}`));
    });
  });
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
 */
async function waitForHealth(baseURL, expectedVersion, child) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  const health = new URL('/health', baseURL);

  while (Date.now() < deadline) {
    // Both are null while it runs, and exactly one is set once it has not —
    // a pillar killed by a signal has no exit code, so watching the code alone
    // would poll a dead port until the ceiling.
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new HarnessError(
        `the BFM ${describeEnd(child.exitCode, child.signalCode)} before answering ${health}. ` +
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
        `something is already serving ${baseURL.origin} and it is not a BFM — ` +
          `${health} answered 2xx with ${answer.why}. Stop it and run this again.`
      );
    }
    await sleep(BOOT_POLL_MS);
  }

  throw new HarnessError(`the BFM did not answer ${health} within ${BOOT_TIMEOUT_MS}ms`);
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
 * Asks the BFM for a pairing code, the way the operator's Devices page does.
 *
 * `/operator/*` needs no credential outside production — `resolveOperator` in
 * `pillars/bfm/src/api/middleware/identity.ts` falls back to a development
 * operator whenever `NODE_ENV` is not `production` — and this harness sets
 * `NODE_ENV=test` for exactly that reason.
 *
 * Only `--serve-only` calls this. The flow's own code is minted by the
 * `clients/ios` half, over the same route, because that half must work against
 * any BFM it is handed and cannot import anything from here.
 *
 * @param {URL} baseURL
 * @returns {Promise<{ code: string, expiresAt: string }>}
 */
async function mintPairingCode(baseURL) {
  const response = await fetch(new URL('/operator/pairing/codes', baseURL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });

  if (!response.ok) {
    throw new HarnessError(
      `POST /operator/pairing/codes answered ${response.status}. Body: ${await response.text()}`
    );
  }
  return response.json();
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
  const args = process.argv.slice(2);
  const serveOnly = args.includes('--serve-only');
  const unknown = args.filter((arg) => arg !== '--serve-only');
  if (unknown.length > 0) {
    process.stderr.write(`ios-e2e: unknown argument(s): ${unknown.join(' ')}\n`);
    process.exitCode = 2;
    return;
  }

  const port = await allocatePort();
  const baseURL = new URL(`http://${HOST}:${port}`);
  const buildVersion = `ios-e2e-${randomUUID()}`;
  const dataDir = mkdtempSync(join(tmpdir(), 'pops-ios-e2e-'));
  /** @type {Array<() => Promise<void>>} */
  const teardown = [async () => rmSync(dataDir, { recursive: true, force: true })];
  let tornDown = false;

  /**
   * Every step runs even when one throws. They are independent — a pillar, a
   * socket and a directory — and the one that fails is never a reason to leave
   * the other two behind, least of all a listening port.
   */
  const tearDown = async () => {
    if (tornDown) return;
    tornDown = true;
    for (const step of teardown) {
      try {
        await step();
      } catch (error) {
        process.stderr.write(`ios-e2e: teardown step failed: ${String(error)}\n`);
      }
    }
  };

  // A signal has to reach the teardown, not just this process. Ctrl-C happens
  // to work without this — the terminal signals the whole foreground group, so
  // the pillar dies with its parent — but `kill` on this pid alone does not,
  // and it leaves a BFM listening on a port with nobody left who knows it is
  // there. That is the exact state that made this harness pair against a
  // stranger's pillar once already; see this file's note on the port.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      process.stderr.write(`\nios-e2e: ${signal} — tearing down.\n`);
      void tearDown().then(() => process.exit(130));
    });
  }

  try {
    const upstream = await startUpstreamStub({ rows: seededTransactions, host: HOST });
    teardown.unshift(upstream.close);
    process.stdout.write(`ios-e2e: registry + finance stub on ${upstream.url}\n`);

    await run('pnpm', ['--filter', '@pops/bfm', 'build']);

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
        BFM_PAIRING_CODE_TTL_MS: String(PAIRING_CODE_TTL_MS),
        // The BFM crashes at boot without one. The stub ignores the header it
        // ends up on.
        POPS_INTERNAL_API_KEY: 'ios-e2e-service-account-key',
        POPS_REGISTRY_URL: upstream.url,
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

    const control = await startControlPlane({
      bfmBaseUrl: baseURL.origin,
      accessTokenSecret: ACCESS_TOKEN_SECRET,
      upstream,
    });
    teardown.unshift(control.close);
    // The same identity check, through the proxy this time. A control plane
    // that forwards nothing looks identical to a healthy one until a flow pairs
    // against it and fails on a screen twenty minutes later; asking it for the
    // BFM's own `/health` proves the whole path before anything is driven.
    await waitForHealth(new URL(control.url), buildVersion, bfm);
    process.stdout.write(`ios-e2e: control plane on ${control.url}, proxying to the bfm\n`);

    if (serveOnly) {
      const { code, expiresAt } = await mintPairingCode(baseURL);
      process.stdout.write(
        `\nios-e2e: server address ${baseURL.origin}\n` +
          `ios-e2e: recovery-flow server address ${control.url} (same bfm, switchable)\n` +
          `ios-e2e: pairing code ${code}, good until ${expiresAt}\n` +
          'ios-e2e: type either address and the code into the app; Ctrl-C to tear this down.\n\n'
      );
      // Waits for a signal, which the handlers above turn into a teardown and
      // an exit. Nothing resolves this.
      await new Promise(() => {});
      return;
    }

    await run('mise', ['-C', 'clients/ios', 'run', 'e2e'], {
      env: {
        ...process.env,
        POPS_BFM_BASE_URL: baseURL.origin,
        POPS_E2E_CONTROL_URL: control.url,
      },
    });
  } finally {
    await tearDown();
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof HarnessError) {
    process.stderr.write(`ios-e2e: ${error.message}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
