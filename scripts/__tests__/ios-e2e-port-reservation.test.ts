import { createServer, type Server } from 'node:net';

import { describe, expect, it } from 'vitest';

import { reserveTcpPort } from '../ios-e2e/port-reservation.mjs';

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

describe('iOS E2E port reservation', () => {
  it('keeps the selected port unavailable until the child is ready to bind', async () => {
    const reservation = await reserveTcpPort('127.0.0.1');
    const contender = createServer();
    try {
      await expect(listen(contender, reservation.port)).rejects.toMatchObject({
        code: 'EADDRINUSE',
      });
      await reservation.release();
      await listen(contender, reservation.port);
      expect(contender.listening).toBe(true);
    } finally {
      await reservation.release();
      if (contender.listening) await close(contender);
    }
  });

  it('allows concurrent cleanup and leaves a subsequent listener alone', async () => {
    const reservation = await reserveTcpPort('127.0.0.1');
    await Promise.all([reservation.release(), reservation.release()]);
    const child = createServer();
    try {
      await listen(child, reservation.port);
      await reservation.release();
      expect(child.listening).toBe(true);
    } finally {
      if (child.listening) await close(child);
    }
  });
});
