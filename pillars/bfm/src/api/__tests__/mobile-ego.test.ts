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

const CONVERSATIONS_PATH = '/mobile/ego/conversations';
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
  };
}

function get(app: Express, token: string | null, path: string) {
  return requestOn(app, (r) => {
    const request = r.get(path);
    return token === null ? request : request.set('Authorization', `Bearer ${token}`);
  });
}

describe('the mobile Ego conversation routes', () => {
  it('refuses a request without a device token', async () => {
    const { app } = openWith(egoClient());

    const response = await get(app, null, CONVERSATIONS_PATH);

    expect(response.status).toBe(401);
  });

  it('requires ego.chat for an explicitly granted device', async () => {
    const { app, token } = openWith(egoClient(), ['session.read']);

    const response = await get(app, token, CONVERSATIONS_PATH);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'capability_not_granted',
      capability: 'ego.chat',
    });
  });

  it('maps q to the upstream search parameter and returns the conversation page', async () => {
    const calls: Parameters<MobileEgoClient['listConversations']>[0][] = [];
    const { app, token } = openWith(
      egoClient({
        listConversations: (input) => {
          calls.push(input);
          return Promise.resolve({
            kind: 'ok',
            value: {
              conversations: [
                {
                  id: 'conversation-1',
                  title: 'Quarterly review',
                  createdAt: '2026-10-01T00:00:00.000Z',
                  updatedAt: '2026-10-02T00:00:00.000Z',
                },
              ],
              total: 1,
            },
          });
        },
      })
    );

    const response = await get(
      app,
      token,
      `${CONVERSATIONS_PATH}?limit=17&offset=4&q=${encodeURIComponent('quarterly review')}`
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      conversations: [{ id: 'conversation-1', title: 'Quarterly review' }],
      total: 1,
    });
    expect(calls).toEqual([{ limit: 17, offset: 4, search: 'quarterly review' }]);
  });

  it('returns a conversation thread with its message parts', async () => {
    const { app, token } = openWith(
      egoClient({
        getConversation: (id) =>
          Promise.resolve({
            kind: 'ok',
            value: {
              conversation: {
                id,
                title: 'Quarterly review',
                createdAt: '2026-10-01T00:00:00.000Z',
                updatedAt: '2026-10-02T00:00:00.000Z',
              },
              messages: [
                {
                  id: 'message-1',
                  role: 'assistant',
                  createdAt: '2026-10-02T00:01:00.000Z',
                  parts: [
                    { type: 'text', text: 'Found the transaction.' },
                    {
                      type: 'entity',
                      uri: 'pops:finance/transaction/txn-1',
                      title: 'Coffee',
                    },
                  ],
                },
              ],
            },
          }),
      })
    );

    const response = await get(app, token, `${CONVERSATIONS_PATH}/conversation-1`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      conversation: { id: 'conversation-1', title: 'Quarterly review' },
      messages: [
        {
          id: 'message-1',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Found the transaction.' },
            { type: 'entity', uri: 'pops:finance/transaction/txn-1', title: 'Coffee' },
          ],
        },
      ],
    });
  });

  it('returns 404 when the requested conversation does not exist', async () => {
    const { app, token } = openWith(
      egoClient({
        getConversation: () =>
          Promise.resolve({ kind: 'not-found', pillar: 'cerebrum', status: 404 }),
      })
    );

    const response = await get(app, token, `${CONVERSATIONS_PATH}/missing`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: 'bfm.upstream.contract_mismatch',
      details: { upstream: { pillar: 'cerebrum', status: 404 } },
    });
  });

  it('maps an unavailable list client to 503', async () => {
    const { app, token } = openWith(
      egoClient({
        listConversations: () =>
          Promise.resolve({ kind: 'unavailable', pillar: 'cerebrum', status: 503 }),
      })
    );

    const response = await get(app, token, CONVERSATIONS_PATH);

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: 'gateway.upstream_unavailable',
      retryable: true,
    });
  });

  it('maps an upstream contract mismatch to 502', async () => {
    const { app, token } = openWith(
      egoClient({
        getConversation: () =>
          Promise.resolve({ kind: 'contract-mismatch', pillar: 'cerebrum', status: 502 }),
      })
    );

    const response = await get(app, token, `${CONVERSATIONS_PATH}/conversation-1`);

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      code: 'bfm.upstream.contract_mismatch',
      retryable: false,
    });
  });
});
