import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_DEVICE_CAPABILITIES,
  serialiseDeviceCapabilities,
  type MobileCapability,
} from '../../contract/capabilities.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createTestApp, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

import type { Express } from 'express';

import type { MobileEgoClient } from '../ego/client.js';

const DECISION_PATH = '/mobile/ego/action-batches/batch-1/decide';
const decision = {
  approve: ['action-approved'],
  reject: ['action-rejected'],
  alwaysAllow: ['tool-name'],
};
const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) apps.pop()?.cleanup();
});

function openWith(
  ego: MobileEgoClient,
  capabilities: readonly MobileCapability[] = DEFAULT_DEVICE_CAPABILITIES
): { app: Express; token: string } {
  const created = createTestApp({ ego });
  apps.push(created);

  const row = deviceRow({
    capabilityMode: 'explicit',
    capabilities: serialiseDeviceCapabilities(capabilities),
  });
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

  return { app: created.app, token };
}

function egoClient(overrides: Partial<MobileEgoClient> = {}): MobileEgoClient {
  return {
    listConversations:
      overrides.listConversations ??
      (() => Promise.resolve({ kind: 'unavailable', pillar: 'cerebrum', status: 503 })),
    getConversation:
      overrides.getConversation ??
      (() => Promise.resolve({ kind: 'unavailable', pillar: 'cerebrum', status: 503 })),
    decideBatch:
      overrides.decideBatch ??
      (() => Promise.resolve({ kind: 'unavailable', pillar: 'cerebrum', status: 503 })),
  };
}

function postDecision(app: Express, token: string, body: object) {
  return requestOn(app, (r) =>
    r.post(DECISION_PATH).set('Authorization', `Bearer ${token}`).send(body)
  );
}

describe('the mobile Ego action decision route', () => {
  it('forwards all three decision lists and returns the batch acknowledgement', async () => {
    const calls: { batchId: string; decision: typeof decision }[] = [];
    const { app, token } = openWith(
      egoClient({
        decideBatch: (batchId, body) => {
          calls.push({ batchId, decision: body });
          return Promise.resolve({ kind: 'ok', value: { batchId } });
        },
      })
    );

    const response = await postDecision(app, token, decision);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ batchId: 'batch-1' });
    expect(calls).toEqual([{ batchId: 'batch-1', decision }]);
  });

  it('requires alwaysAllow before calling Cerebrum', async () => {
    const calls: unknown[] = [];
    const { app, token } = openWith(
      egoClient({
        decideBatch: (...args) => {
          calls.push(args);
          return Promise.resolve({ kind: 'ok', value: { batchId: 'batch-1' } });
        },
      })
    );

    const response = await postDecision(app, token, { approve: [], reject: [] });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('bfm.request.invalid');
    expect(calls).toEqual([]);
  });

  it('preserves an upstream conflict as 409', async () => {
    const { app, token } = openWith(
      egoClient({
        decideBatch: () =>
          Promise.resolve({
            kind: 'conflict',
            pillar: 'cerebrum',
            status: 409,
            upstreamStatus: 409,
            code: 'cerebrum.ego.batch.stale',
            message: 'This batch has already been decided.',
            requestId: 'cerebrum-request-1',
            retryable: false,
          }),
      })
    );

    const response = await postDecision(app, token, decision);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'cerebrum.ego.batch.stale',
      message: 'This batch has already been decided.',
      requestId: 'cerebrum-request-1',
      retryable: false,
    });
  });

  it('preserves an upstream not-found as 404', async () => {
    const { app, token } = openWith(
      egoClient({
        decideBatch: () => Promise.resolve({ kind: 'not-found', pillar: 'cerebrum', status: 404 }),
      })
    );

    const response = await postDecision(app, token, decision);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: 'bfm.upstream.contract_mismatch',
      details: { upstream: { pillar: 'cerebrum', status: 404 } },
    });
  });

  it('maps an unavailable Cerebrum decision client to 503', async () => {
    const { app, token } = openWith(egoClient());

    const response = await postDecision(app, token, decision);

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: 'gateway.upstream_unavailable',
      retryable: true,
    });
  });
});
