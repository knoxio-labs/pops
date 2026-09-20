import { once } from 'node:events';
import {
  Agent,
  createServer,
  get,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

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

/**
 * A promise whose resolver is available to the test body, without a definite
 * assignment assertion.
 */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let capture: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    capture = resolve;
  });
  if (capture === undefined) {
    throw new Error('promise executor did not run synchronously');
  }
  return { promise, resolve: capture };
}

function portOf(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a TCP address');
  }
  return address.port;
}

/**
 * These drive a real `node:http` server over a real keep-alive socket on
 * purpose. The defect POPS-4218 fixes is a property of node's own `close()`
 * against a client that has not hung up, so every test double in this file —
 * and every pillar's `test-http.ts`, each of which calls
 * `server.closeAllConnections()` in teardown — is blind to it by construction.
 */
describe('shutdownPillar connection draining', () => {
  const openServers: Server[] = [];
  const openAgents: Agent[] = [];

  function serve(handler: (res: ServerResponse) => void): Promise<Server> {
    const server = createServer((_req, res) => void handler(res));
    openServers.push(server);
    server.listen(0, '127.0.0.1');
    return once(server, 'listening').then(() => server);
  }

  function keepAliveAgent(): Agent {
    const agent = new Agent({ keepAlive: true });
    openAgents.push(agent);
    return agent;
  }

  afterEach(() => {
    for (const agent of openAgents) agent.destroy();
    openAgents.length = 0;
    for (const server of openServers) {
      server.closeAllConnections();
      server.close();
    }
    openServers.length = 0;
  });

  it('stops serving while a client holds an open SSE stream', async () => {
    const streaming = deferred<void>();
    const server = await serve((res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(': open\n\n');
      streaming.resolve();
    });
    const agent = keepAliveAgent();

    const response = await new Promise<IncomingMessage>((resolve) => {
      get({ host: '127.0.0.1', port: portOf(server), path: '/', agent }, resolve);
    });
    response.resume();
    response.on('error', () => undefined);
    await streaming.promise;

    await shutdownPillar({
      label: 'registry-api',
      steps: [],
      server,
      drainGraceMs: 25,
      logger: recordingLogger().logger,
    });
  });

  it('lets a request that is already in flight finish', async () => {
    const entered = deferred<ServerResponse>();
    const server = await serve((res) => entered.resolve(res));
    const agent = keepAliveAgent();

    const body = new Promise<string>((resolve) => {
      get({ host: '127.0.0.1', port: portOf(server), path: '/', agent }, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          text += chunk;
        });
        res.on('end', () => resolve(text));
      });
    });

    const inFlight = await entered.promise;
    const stopping = shutdownPillar({
      label: 'registry-api',
      steps: [],
      server,
      drainGraceMs: 1_500,
      logger: recordingLogger().logger,
    });

    inFlight.end('finished');
    // The body arriving whole is the assertion: shutting down mid-response
    // must not truncate it. The socket it came in on is a separate matter —
    // it goes back to the agent's pool and is reaped by the grace timer.
    await expect(body).resolves.toBe('finished');
    await stopping;
  });

  it('destroys a connection that outlives the drain grace', async () => {
    const entered = deferred<ServerResponse>();
    const server = await serve((res) => entered.resolve(res));
    const agent = keepAliveAgent();
    const { logger, warns } = recordingLogger();

    get({ host: '127.0.0.1', port: portOf(server), path: '/', agent }).on('error', () => undefined);
    await entered.promise;

    await shutdownPillar({
      label: 'registry-api',
      steps: [],
      server,
      drainGraceMs: 25,
      logger,
    });

    expect(warns).toContain('[registry-api] drain grace elapsed; destroying remaining connections');
  });
});
