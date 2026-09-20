import { errSummary } from './errors.js';
import { consoleLogger, type BootstrapLogger } from './logger.js';

/**
 * The `close(cb)` surface of a listening `node:http` server, plus the forced
 * teardown node has carried since 18.2.
 *
 * Both draining calls are optional so a test double stays a two-line object
 * literal; a real server always has them.
 */
export interface ClosableServer {
  close(callback?: (err?: Error) => void): unknown;
  closeIdleConnections?: () => void;
  closeAllConnections?: () => void;
}

/**
 * One asynchronous thing a pillar must settle before it stops serving —
 * deregistering from the registry, draining a scheduler, closing a queue.
 * `name` only ever appears in the log line for a step that failed.
 */
export interface ShutdownStep {
  name: string;
  run: () => Promise<unknown> | unknown;
}

export interface ShutdownPillarOptions {
  /** Pillar process label, without brackets — e.g. `media-api`. */
  label: string;
  /** Run in order. A step that fails is logged and the rest still run. */
  steps: readonly ShutdownStep[];
  server: ClosableServer;
  /** Closes the pillar's database, once the last request has been answered. */
  closeDb?: () => void;
  /** How long an in-flight request has to finish before its socket is destroyed. */
  drainGraceMs?: number;
  logger?: BootstrapLogger;
}

/**
 * How long a request already in flight gets to finish before the remaining
 * sockets are destroyed.
 *
 * The number that matters is the one at the other end: Watchtower stops a
 * container with `WATCHTOWER_TIMEOUT=30s` and docker SIGKILLs whatever is
 * still alive after it. Anything under that ceiling turns a kill into a clean
 * exit, so this is chosen to be generous to a slow request rather than close
 * to the limit.
 */
export const DEFAULT_DRAIN_GRACE_MS = 5_000;

/**
 * Stop serving: refuse new connections, then give whatever is still mid-response
 * `graceMs` before destroying its socket.
 *
 * `close()` alone is not enough, and the gap is not idle keep-alive sockets —
 * node has closed those itself since 19.0. It is the responses that never end.
 * The registry serves `GET /registry/subscribe` as SSE and pops-shell holds
 * that stream open for the life of the process, so the registry's `close()`
 * waited on a response with no reason to finish and was still waiting when
 * docker SIGKILLed it 30 seconds later — on 44 of 44 restarts (POPS-4218).
 * cerebrum-api serves two SSE routes of its own and shows the same 44 of 44.
 */
async function stopServing(
  server: ClosableServer,
  graceMs: number,
  logger: BootstrapLogger,
  prefix: string
): Promise<void> {
  await new Promise<void>((resolve) => {
    let force: ReturnType<typeof setTimeout> | undefined;

    server.close((err?: Error) => {
      if (force !== undefined) clearTimeout(force);
      if (err !== undefined && err !== null) {
        logger.warn(`${prefix} server close reported an error`, { err: errSummary(err) });
      }
      resolve();
    });

    // Reaps the sockets a client's keep-alive pool is holding but not using.
    // node has closed idle connections on `close()` since 19.0, but only the
    // ones already idle when it was called: a socket returned to the pool
    // afterwards is not reaped, and without this every pillar would sit out
    // the full grace below on a connection nobody was using.
    server.closeIdleConnections?.();

    const closeAll = server.closeAllConnections;
    if (closeAll === undefined) return;

    force = setTimeout(() => {
      logger.warn(`${prefix} drain grace elapsed; destroying remaining connections`, { graceMs });
      closeAll.call(server);
    }, graceMs);
    // So the timer itself can never be the reason the process is still up.
    force.unref?.();
  });
}

/**
 * Runs a pillar's shutdown sequence and then closes it down: every step
 * settles, then the HTTP server stops accepting and drains, then the database
 * closes.
 *
 * No step can abort the sequence. A rejected deregister — the ordinary case
 * when the whole stack comes down together and the registry went first — used
 * to escape the `.finally()` each pillar hand-rolled, kill the process on an
 * unhandled rejection, and take the database close with it: the WAL was never
 * checkpointed and the next boot replayed it (POPS-2795). Every step is
 * therefore caught and logged, and the close runs regardless.
 *
 * Resolves once the database has closed, so a test can await the whole
 * sequence; production callers fire it and let the process exit.
 */
export async function shutdownPillar(options: ShutdownPillarOptions): Promise<void> {
  const logger = options.logger ?? consoleLogger();
  const prefix = `[${options.label}]`;

  for (const step of options.steps) {
    try {
      await step.run();
    } catch (err: unknown) {
      logger.error(`${prefix} shutdown step failed; continuing`, {
        step: step.name,
        err: errSummary(err),
      });
    }
  }

  await stopServing(options.server, options.drainGraceMs ?? DEFAULT_DRAIN_GRACE_MS, logger, prefix);

  try {
    options.closeDb?.();
  } catch (err: unknown) {
    logger.error(`${prefix} database close failed`, { err: errSummary(err) });
  }
}
