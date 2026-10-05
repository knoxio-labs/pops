import express, { type Express } from 'express';
import { describe, expect, it } from 'vitest';

import { RateLimitErrorSchema } from '../../../contract/rest-schemas.js';
import { requestOn } from '../../__tests__/test-http.js';
import {
  createEgoRateLimit,
  MOBILE_EGO_GLOBAL_LIMIT,
  MOBILE_EGO_PER_CLIENT_LIMIT,
  MOBILE_EGO_RATE_LIMIT_WINDOW_MS,
  type EgoRateLimitOptions,
} from '../ego-rate-limit.js';

import type { TieredRateLimit } from '../../tiered-rate-limit.js';

function mount(options: EgoRateLimitOptions = {}): { app: Express; limiter: TieredRateLimit } {
  const limiter = createEgoRateLimit(options);
  const app = express();
  app.use(limiter.handler);
  app.post('/ego/chat/stream', (_req, res) => res.status(200).json({ ok: true }));
  return { app, limiter };
}

function attempt(app: Express, clientIp: string) {
  return requestOn(app, (request) =>
    request.post('/ego/chat/stream').set('CF-Connecting-IP', clientIp)
  );
}

describe('the shipped Ego budget', () => {
  it('keeps the one-minute, per-client and global limits distinct', () => {
    expect(MOBILE_EGO_RATE_LIMIT_WINDOW_MS).toBe(60_000);
    expect(MOBILE_EGO_PER_CLIENT_LIMIT).toBe(12);
    expect(MOBILE_EGO_GLOBAL_LIMIT).toBe(36);
  });

  it('refuses the 13th turn from one client with the standard 429 response', async () => {
    const { app } = mount({ now: () => 1_000 });
    const statuses: number[] = [];
    for (let index = 0; index < MOBILE_EGO_PER_CLIENT_LIMIT; index += 1) {
      statuses.push((await attempt(app, '203.0.113.7')).status);
    }
    const refused = await attempt(app, '203.0.113.7');

    expect(statuses).toEqual(Array(MOBILE_EGO_PER_CLIENT_LIMIT).fill(200));
    expect(refused.status).toBe(429);
    expect(RateLimitErrorSchema.parse(refused.body)).toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 60,
    });
    expect(refused.headers['retry-after']).toBe('60');
  });

  it('leaves another client able to chat after the first reaches its limit', async () => {
    const { app } = mount({ now: () => 1_000 });
    for (let index = 0; index <= MOBILE_EGO_PER_CLIENT_LIMIT; index += 1) {
      await attempt(app, '203.0.113.7');
    }

    const other = await attempt(app, '198.51.100.4');

    expect(other.status).toBe(200);
  });

  it('resets the client budget after one injected-clock window', async () => {
    let now = 1_000;
    const { app } = mount({ now: () => now });
    for (let index = 0; index < MOBILE_EGO_PER_CLIENT_LIMIT; index += 1) {
      await attempt(app, '203.0.113.7');
    }
    expect((await attempt(app, '203.0.113.7')).status).toBe(429);

    now += MOBILE_EGO_RATE_LIMIT_WINDOW_MS;

    expect((await attempt(app, '203.0.113.7')).status).toBe(200);
  });

  it('caps 37 turns spread across clients who stay below their own limits', async () => {
    const { app, limiter } = mount({ now: () => 1_000 });
    const clients = ['203.0.113.1', '203.0.113.2', '203.0.113.3', '203.0.113.4'];
    const statuses: number[] = [];
    for (let index = 0; index <= MOBILE_EGO_GLOBAL_LIMIT; index += 1) {
      const client = clients[index % clients.length];
      if (client === undefined) throw new Error('missing test client');
      statuses.push((await attempt(app, client)).status);
    }

    expect(statuses.slice(0, MOBILE_EGO_GLOBAL_LIMIT)).toEqual(
      Array(MOBILE_EGO_GLOBAL_LIMIT).fill(200)
    );
    expect(statuses.at(-1)).toBe(429);
    expect(limiter.trackedClients()).toBe(clients.length);
  });
});
