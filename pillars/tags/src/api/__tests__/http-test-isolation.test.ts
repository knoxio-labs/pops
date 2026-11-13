import request from 'supertest';
import { expect, it } from 'vitest';

import type { RequestListener } from 'node:http';

it('uses IPv4 loopback for ephemeral HTTP test listeners', async () => {
  let localAddress: string | undefined;
  const listener: RequestListener = (req, res) => {
    localAddress = req.socket.localAddress;
    res.statusCode = 204;
    res.end();
  };

  await request(listener).get('/binding').expect(204);

  expect(localAddress).toBe('127.0.0.1');
});
