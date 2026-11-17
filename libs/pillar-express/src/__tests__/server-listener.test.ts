import express from 'express';
import { describe, expect, it } from 'vitest';

import { listenPillarServer } from '../server-listener.js';

import type { Server } from 'node:http';

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

describe('listenPillarServer', () => {
  it.each([undefined, '127.0.0.1'])('serves the app on bind host %s', async (bindHost) => {
    const app = express();
    app.get('/health', (_request, response) => response.sendStatus(204));
    const server = await listenPillarServer(app, 0, bindHost);
    try {
      expect(server.listening).toBe(true);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('Expected a TCP listener address');
      }
      if (bindHost !== undefined) expect(address.address).toBe(bindHost);
      const host = address.family === 'IPv6' ? '[::1]' : '127.0.0.1';
      const response = await fetch(`http://${host}:${address.port}/health`);
      expect(response.status).toBe(204);
    } finally {
      await closeServer(server);
    }
  });

  it('rejects an occupied port instead of reporting successful startup', async () => {
    const occupied = await listenPillarServer(express(), 0, '127.0.0.1');
    try {
      const address = occupied.address();
      if (address === null || typeof address === 'string') {
        throw new Error('Expected a TCP listener address');
      }
      await expect(listenPillarServer(express(), address.port, '127.0.0.1')).rejects.toMatchObject({
        code: 'EADDRINUSE',
        syscall: 'listen',
      });
      expect(occupied.listening).toBe(true);
    } finally {
      await closeServer(occupied);
    }
  });

  it('rejects invalid port arguments', async () => {
    await expect(listenPillarServer(express(), -1)).rejects.toMatchObject({
      code: 'ERR_SOCKET_BAD_PORT',
    });
  });
});
