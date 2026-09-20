/**
 * pops-mcp runs as PID 1 (`CMD ["node", "dist/index.js"]`, exec form, no init
 * shim), and the kernel applies no default signal disposition to PID 1: a
 * signal reaches it only if a handler is installed for it. So "node exits on
 * SIGTERM" is not true here, and the only thing standing between this process
 * and a SIGKILL is the registration these tests assert.
 *
 * A spawned-subprocess test could not cover this — a child is not PID 1, so it
 * dies on the default disposition whether or not a handler exists, and would
 * pass against the very bug this file exists for. The handlers are therefore
 * driven through an injected signal target.
 */
process.env['NODE_ENV'] = 'test';
process.env['POPS_API_KEY'] = 'sa_test';

import { describe, expect, it, vi } from 'vitest';

import { installShutdownHandlers, type SignalTarget } from './index.js';

import type { ClosableServer } from '@pops/pillar-sdk/bootstrap';

function recordingTarget(): {
  target: SignalTarget;
  handlers: Map<string, (signal: NodeJS.Signals) => void>;
} {
  const handlers = new Map<string, (signal: NodeJS.Signals) => void>();
  return {
    target: {
      on(signal, handler) {
        handlers.set(signal, handler);
        return undefined;
      },
    },
    handlers,
  };
}

function fakeServer(): ClosableServer & { closed: number } {
  const server = {
    closed: 0,
    close(callback?: (err?: Error) => void): unknown {
      server.closed += 1;
      setTimeout(() => callback?.(), 0);
      return undefined;
    },
  };
  return server;
}

describe('installShutdownHandlers', () => {
  it('registers a handler for both signals docker and the operator send', () => {
    const { target, handlers } = recordingTarget();

    installShutdownHandlers(fakeServer(), target);

    expect([...handlers.keys()].toSorted()).toEqual(['SIGINT', 'SIGTERM']);
  });

  it('closes the server when SIGTERM arrives', async () => {
    const { target, handlers } = recordingTarget();
    const server = fakeServer();

    installShutdownHandlers(server, target);
    handlers.get('SIGTERM')?.('SIGTERM');
    await vi.waitFor(() => expect(server.closed).toBe(1));
  });

  it('closes the server when SIGINT arrives', async () => {
    const { target, handlers } = recordingTarget();
    const server = fakeServer();

    installShutdownHandlers(server, target);
    handlers.get('SIGINT')?.('SIGINT');
    await vi.waitFor(() => expect(server.closed).toBe(1));
  });

  it('closes once when a second signal arrives', async () => {
    const { target, handlers } = recordingTarget();
    const server = fakeServer();

    installShutdownHandlers(server, target);
    handlers.get('SIGTERM')?.('SIGTERM');
    handlers.get('SIGINT')?.('SIGINT');
    await vi.waitFor(() => expect(server.closed).toBe(1));

    expect(server.closed).toBe(1);
  });
});
