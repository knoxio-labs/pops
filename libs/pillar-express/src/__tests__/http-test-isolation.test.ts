import { Server } from 'node:net';

import express from 'express';
import request from 'supertest';
import { expect, it } from 'vitest';

it('binds ephemeral test servers to the IPv4 loopback used by the client', async () => {
  const app = express();
  const probe = request(app).get('/binding');
  const server = probe.app;
  if (!(server instanceof Server)) throw new Error('Expected an HTTP test server');

  app.get('/binding', (_req, res) => {
    res.json({ binding: server.address() });
  });

  const response = await probe;

  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    binding: { address: '127.0.0.1', family: 'IPv4', port: expect.any(Number) },
  });
});
