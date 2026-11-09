import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from '@pops/pillar-sdk/client';

import { createClient } from '../trips-api/client';
import { client as defaultClient } from '../trips-api/client.gen';
import { loadStay, patchStay, requestProblem } from './api';
import { sourceStay } from './test-utils';

import type { Server } from 'node:http';

let server: Server;
let origin: string;
const requests: { method: string | undefined; path: string | undefined; body: string }[] = [];

beforeEach(async () => {
  requests.length = 0;
  server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      requests.push({ method: request.method, path: request.url, body });
      if (!request.headers['x-api-key']) {
        response.writeHead(401);
        response.end(
          JSON.stringify({
            code: 'trips.authentication.required',
            message: 'Authentication is required',
            retryable: false,
            requestId: 'http-test-request',
          })
        );
        return;
      }
      if (request.headers['x-test-refuse'] === 'true') {
        response.writeHead(400);
        response.end(
          JSON.stringify({
            code: 'trips.request.invalid',
            message: 'Source validation failed',
            retryable: false,
            requestId: 'http-test-request',
          })
        );
        return;
      }
      response.end(
        JSON.stringify(sourceStay(request.method === 'PATCH' ? { name: 'Edited over HTTP' } : {}))
      );
    });
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  server.closeIdleConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

describe('Generated Trips client over HTTP', () => {
  it('defaults to the authenticated shell proxy rather than a second source endpoint', () => {
    expect(defaultClient.getConfig().baseUrl).toBe('/trips-api');
  });
  it('reads and patches the owning trip route and sends only explicit mutation fields', async () => {
    const client = createClient({
      baseUrl: origin,
      headers: { 'x-api-key': 'test-service-account' },
    });
    const identity = { tripId: 7, stayId: 13, client };
    expect(await loadStay(identity)).toEqual(sourceStay());
    expect(await patchStay(identity, { name: 'Edited over HTTP' })).toEqual(
      sourceStay({ name: 'Edited over HTTP' })
    );
    expect(requests).toEqual([
      { method: 'GET', path: '/trips/7/stays/13', body: '' },
      {
        method: 'PATCH',
        path: '/trips/7/stays/13',
        body: JSON.stringify({ name: 'Edited over HTTP' }),
      },
    ]);
  });
  it('retains authentication and validation HTTP diagnostics for safe presentation', async () => {
    const client = createClient({ baseUrl: origin });
    await expect(loadStay({ tripId: 7, stayId: 13, client })).rejects.toMatchObject({
      status: 401,
      code: 'trips.authentication.required',
      retryable: false,
      requestId: 'http-test-request',
    });
    const refused = createClient({
      baseUrl: origin,
      headers: { 'x-api-key': 'test-service-account', 'x-test-refuse': 'true' },
    });
    await expect(
      patchStay({ tripId: 7, stayId: 13, client: refused }, { reference: null })
    ).rejects.toMatchObject({
      status: 400,
      code: 'trips.request.invalid',
      requestId: 'http-test-request',
    });
  });
  it('never exposes arbitrary unexpected error details', () => {
    expect(requestProblem(new Error('sensitive raw transport detail'))).toEqual({
      code: 'web.request.failed',
      message: 'The request could not be completed',
      retryable: true,
    });
    const error = new ApiError({
      kind: 'client',
      code: 'trips.request.invalid',
      message: 'Source validation failed',
      retryable: false,
    });
    expect(requestProblem(error)).toBe(error);
  });
});
