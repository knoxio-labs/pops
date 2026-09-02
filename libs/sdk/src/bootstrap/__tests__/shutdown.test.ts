import { describe, expect, it, vi } from 'vitest';

import { shutdownPillar, type ClosableServer } from '../shutdown.js';

import type { BootstrapLogger } from '../logger.js';

function recordingLogger(): { logger: BootstrapLogger; errors: string[]; warns: string[] } {
  const errors: string[] = [];
  const warns: string[] = [];
  return {
    logger: {
      info: () => undefined,
      warn: (msg) => warns.push(msg),
      error: (msg) => errors.push(msg),
    },
    errors,
    warns,
  };
}

/** A server whose close callback fires asynchronously, as node's does. */
function fakeServer(err?: Error): ClosableServer & { closed: number } {
  const server = {
    closed: 0,
    close(callback?: (e?: Error) => void): unknown {
      server.closed += 1;
      setTimeout(() => callback?.(err), 0);
      return undefined;
    },
  };
  return server;
}

describe('shutdownPillar', () => {
  it('runs the steps in order, then closes the server, then the database', async () => {
    const order: string[] = [];
    const server = fakeServer();

    await shutdownPillar({
      label: 'media-api',
      steps: [
        { name: 'drain', run: () => void order.push('drain') },
        {
          name: 'deregister',
          run: async () => {
            await Promise.resolve();
            order.push('deregister');
          },
        },
      ],
      server: {
        close(callback) {
          order.push('server');
          return server.close(callback);
        },
      },
      closeDb: () => void order.push('db'),
    });

    expect(order).toEqual(['drain', 'deregister', 'server', 'db']);
  });

  it('still closes the database when a step rejects', async () => {
    const closeDb = vi.fn();
    const { logger, errors } = recordingLogger();

    await shutdownPillar({
      label: 'design-api',
      steps: [{ name: 'deregister', run: () => Promise.reject(new Error('registry gone')) }],
      server: fakeServer(),
      closeDb,
      logger,
    });

    expect(closeDb).toHaveBeenCalledTimes(1);
    expect(errors).toEqual(['[design-api] shutdown step failed; continuing']);
  });

  it('runs the remaining steps after one fails', async () => {
    const ran: string[] = [];

    await shutdownPillar({
      label: 'food-api',
      steps: [
        { name: 'deregister', run: () => Promise.reject(new Error('registry gone')) },
        { name: 'close-queue', run: () => void ran.push('close-queue') },
      ],
      server: fakeServer(),
      logger: recordingLogger().logger,
    });

    expect(ran).toEqual(['close-queue']);
  });

  it('does not reject when a step throws synchronously', async () => {
    const closeDb = vi.fn();

    await expect(
      shutdownPillar({
        label: 'lists-api',
        steps: [
          {
            name: 'stop-timer',
            run: () => {
              throw new Error('boom');
            },
          },
        ],
        server: fakeServer(),
        closeDb,
        logger: recordingLogger().logger,
      })
    ).resolves.toBeUndefined();
    expect(closeDb).toHaveBeenCalledTimes(1);
  });

  it('closes the database even when the server reports a close error', async () => {
    const closeDb = vi.fn();
    const { logger, warns } = recordingLogger();

    await shutdownPillar({
      label: 'finance-api',
      steps: [],
      server: fakeServer(new Error('not running')),
      closeDb,
      logger,
    });

    expect(closeDb).toHaveBeenCalledTimes(1);
    expect(warns).toEqual(['[finance-api] server close reported an error']);
  });

  it('logs a failing database close rather than rejecting', async () => {
    const { logger, errors } = recordingLogger();

    await expect(
      shutdownPillar({
        label: 'purchases-api',
        steps: [],
        server: fakeServer(),
        closeDb: () => {
          throw new Error('locked');
        },
        logger,
      })
    ).resolves.toBeUndefined();
    expect(errors).toEqual(['[purchases-api] database close failed']);
  });

  it('waits for the server to finish draining before closing the database', async () => {
    const order: string[] = [];
    let release: (() => void) | undefined;

    const pending = shutdownPillar({
      label: 'cerebrum-api',
      steps: [],
      server: {
        close(callback) {
          release = () => {
            order.push('server');
            callback?.();
          };
          return undefined;
        },
      },
      closeDb: () => void order.push('db'),
    });

    await Promise.resolve();
    expect(order).toEqual([]);

    release?.();
    await pending;
    expect(order).toEqual(['server', 'db']);
  });
});
