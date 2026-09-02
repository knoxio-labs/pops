import { errSummary } from './errors.js';
import { consoleLogger, type BootstrapLogger } from './logger.js';

/** The `close(cb)` surface of a listening `node:http` server. */
export interface ClosableServer {
  close(callback?: (err?: Error) => void): unknown;
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
  logger?: BootstrapLogger;
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

  await new Promise<void>((resolve) => {
    options.server.close((err?: Error) => {
      if (err !== undefined && err !== null) {
        logger.warn(`${prefix} server close reported an error`, { err: errSummary(err) });
      }
      resolve();
    });
  });

  try {
    options.closeDb?.();
  } catch (err: unknown) {
    logger.error(`${prefix} database close failed`, { err: errSummary(err) });
  }
}
