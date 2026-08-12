#!/usr/bin/env node
/**
 * Boots the federation the iOS app's Maestro flow needs, then drives it.
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
 * `clients/ios` half of this (`mise -C clients/ios run e2e`) is handed a base
 * URL and speaks nothing but HTTP to it.
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
 * Usage:
 *   node scripts/ios-e2e/run.mjs              run the flow, then tear everything down
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
    const reported = await readHealthVersion(health);
    if (reported === expectedVersion) return;
    if (reported !== undefined) {
      throw new HarnessError(
        `something else is already serving ${baseURL.origin} — it reports version ` +
          `"${reported}", not this harness's "${expectedVersion}". Stop it and run this again.`
      );
    }
    await sleep(BOOT_POLL_MS);
  }

  throw new HarnessError(`the BFM did not answer ${health} within ${BOOT_TIMEOUT_MS}ms`);
}

/**
 * @param {URL} health
 * @returns {Promise<string | undefined>} the reported version, or `undefined`
 *   when nothing usable answered
 */
async function readHealthVersion(health) {
  try {
    const response = await fetch(health, { signal: AbortSignal.timeout(1000) });
    if (!response.ok) return undefined;
    const body = await response.json();
    return typeof body?.version === 'string' ? body.version : undefined;
  } catch {
    // Not up yet, or up and not speaking JSON. A refused connection is the
    // expected answer for the first few polls and says nothing worth
    // reporting on its own.
    return undefined;
  }
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

    if (serveOnly) {
      const { code, expiresAt } = await mintPairingCode(baseURL);
      process.stdout.write(
        `\nios-e2e: server address ${baseURL.origin}\n` +
          `ios-e2e: pairing code ${code}, good until ${expiresAt}\n` +
          'ios-e2e: type both into the app; Ctrl-C to tear this down.\n\n'
      );
      // Waits for a signal, which the handlers above turn into a teardown and
      // an exit. Nothing resolves this.
      await new Promise(() => {});
      return;
    }

    await run('mise', ['-C', 'clients/ios', 'run', 'e2e'], {
      env: { ...process.env, POPS_BFM_BASE_URL: baseURL.origin },
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
