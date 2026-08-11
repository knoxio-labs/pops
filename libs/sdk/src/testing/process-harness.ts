/**
 * Real-process test harness for cross-pillar SDK integration tests.
 *
 * Spawns a pillar's actual `src/api/server.ts` entrypoint as a child
 * process (that pillar's own `node_modules/.bin/tsx <entry>` — the same
 * binary `mise run -C pillars/<id> dev` runs, minus the file watcher) bound
 * to a caller-chosen port, waits for it to answer its own `/health` route,
 * and hands back the base URL plus a `stop()` that sends SIGTERM and waits
 * for exit.
 *
 * Nothing here imports pillar source — a pillar is addressed purely by
 * filesystem directory and HTTP, the same boundary every pillar crosses at
 * runtime, so this lives in the SDK's own testing surface rather than in
 * any one pillar. It is heavier than the in-process `fakePillarHandle`
 * doubles elsewhere in this module: reach for it only when a test must
 * prove a real `pillar()` call reaches a real peer over the wire, not for
 * everyday unit tests. See also `pillar-dir.ts` (locating a pillar's
 * directory), `registration-wait.ts` (waiting for self-registration to
 * land) and `recording-proxy.ts` (observing a request made by a different,
 * spawned process).
 */
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import type { Readable } from 'node:stream';

/**
 * Resolved relative to `cwd`, not invoked through `pnpm exec` — `pnpm exec`
 * forks the real process as its OWN child and then exits once that child
 * has started, rather than staying alive for its whole run. `stop()` tracks
 * the process this module itself spawned, so if that process is `pnpm`, the
 * `exit` event fires almost immediately (when `pnpm` returns), long before
 * the actual server does — `stop()` then sees `exited === true` and returns
 * without ever signalling the real, still-running server, leaking it as an
 * orphan. Spawning the pillar's own `tsx` binary directly makes the tracked
 * process the one that answers `/health` and the one that exits on SIGTERM.
 */
const TSX_BIN = join('node_modules', '.bin', 'tsx');

const DEFAULT_ENTRY = 'src/api/server.ts';
const DEFAULT_HEALTH_PATH = '/health';
const DEFAULT_STARTUP_TIMEOUT_MS = 20_000;
const HEALTH_POLL_INTERVAL_MS = 200;
const HEALTH_FETCH_TIMEOUT_MS = 2_000;
const STOP_GRACE_MS = 5_000;

export interface SpawnPillarProcessOptions {
  /** Used only in error/diagnostic messages, e.g. `'registry'`, `'lists'`. */
  label: string;
  /** Absolute path to the pillar's package directory (`pillars/<id>`). */
  cwd: string;
  /** Entry file relative to `cwd`. Defaults to every TS pillar's real boot script. */
  entry?: string;
  /** Port to bind. Pillars reject `PORT=0`, so resolve one via {@link getFreePort} first. */
  port: number;
  /** Extra environment for the spawned process, merged over `process.env`. */
  env: Record<string, string>;
  /** Liveness path. Defaults to the route `@pops/pillar-sdk/bootstrap` mounts on every pillar. */
  healthPath?: string;
  startupTimeoutMs?: number;
}

export interface SpawnedPillarProcess {
  readonly baseUrl: string;
  readonly port: number;
  /** Sends SIGTERM and waits for exit (SIGKILL after a grace period). Idempotent. */
  stop(): Promise<void>;
}

/**
 * A TCP port free at the moment of the call. Carries the small race window
 * inherent to "ask the OS for a port, close it, hand the number to a
 * different process" — standard practice for test harnesses, not something
 * production code should do.
 */
export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('could not resolve an ephemeral port'));
        return;
      }
      const { port } = address;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

/**
 * Boot one pillar's real HTTP server as a child process and wait for it to
 * answer its own health route.
 *
 * @throws When the process exits before answering, or the health route
 *   never returns `ok` inside `startupTimeoutMs` — either error carries the
 *   process's captured stdout/stderr so a failure is diagnosable without a
 *   local rerun.
 */
export async function spawnPillarProcess(
  options: SpawnPillarProcessOptions
): Promise<SpawnedPillarProcess> {
  const entry = options.entry ?? DEFAULT_ENTRY;
  const healthPath = options.healthPath ?? DEFAULT_HEALTH_PATH;
  const startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  const baseUrl = `http://127.0.0.1:${options.port}`;

  // `detached: true` makes this child its own process-group leader (POSIX
  // setsid), so `stop()` below can signal the whole tree it spawns — `tsx`
  // itself forks a fresh `node` for the loader, and a plain `child.kill()`
  // only ever reaches the immediate process.
  const child: ChildProcessByStdio<null, Readable, Readable> = spawn(
    join(options.cwd, TSX_BIN),
    [entry],
    {
      cwd: options.cwd,
      env: { ...process.env, ...options.env, PORT: String(options.port) },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    }
  );

  const output: string[] = [];
  child.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString('utf8')));

  const state = { exited: false, exitDescription: '' };
  child.once('exit', (code, signal) => {
    state.exited = true;
    state.exitDescription = `exit code ${String(code)}, signal ${String(signal)}`;
  });

  await waitForHealthy({
    label: options.label,
    baseUrl,
    healthPath,
    startupTimeoutMs,
    state,
    output,
  });

  return {
    baseUrl,
    port: options.port,
    async stop() {
      if (state.exited) return;
      killGroup(child.pid, 'SIGTERM');
      const deadline = Date.now() + STOP_GRACE_MS;
      while (!state.exited && Date.now() < deadline) await sleep(HEALTH_POLL_INTERVAL_MS);
      if (!state.exited) killGroup(child.pid, 'SIGKILL');
    },
  };
}

/**
 * Signal an entire process GROUP (negative pid), not just the one process —
 * see the `detached: true` note above `spawn` for why that matters here.
 * Swallows ESRCH: the group can legitimately already be gone (the process
 * exited on its own between the caller's check and this call).
 */
function killGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, signal);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err;
  }
}

interface ExitState {
  exited: boolean;
  exitDescription: string;
}

interface WaitForHealthyArgs {
  label: string;
  baseUrl: string;
  healthPath: string;
  startupTimeoutMs: number;
  state: ExitState;
  output: readonly string[];
}

async function waitForHealthy(args: WaitForHealthyArgs): Promise<void> {
  const deadline = Date.now() + args.startupTimeoutMs;
  for (;;) {
    if (args.state.exited) {
      throw new Error(
        `[${args.label}] process exited before answering ${args.healthPath} ` +
          `(${args.state.exitDescription}):\n${args.output.join('')}`
      );
    }
    try {
      const response = await fetch(`${args.baseUrl}${args.healthPath}`, {
        signal: AbortSignal.timeout(HEALTH_FETCH_TIMEOUT_MS),
      });
      if (response.ok) return;
    } catch {
      // Not up yet — keep polling until the deadline.
    }
    if (Date.now() > deadline) {
      throw new Error(
        `[${args.label}] timed out after ${args.startupTimeoutMs}ms waiting for ` +
          `${args.baseUrl}${args.healthPath}:\n${args.output.join('')}`
      );
    }
    await sleep(HEALTH_POLL_INTERVAL_MS);
  }
}
