import { describe, expect, it } from 'vitest';

import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import { createPillarGateway } from '../../pillars/gateway.js';
import { createMobileEgoClient } from '../client.js';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { PillarHandleFactory } from '../../pillars/gateway.js';

type ListInput = { limit?: number; offset?: number; search?: string };
type GetInput = { id: string };
type EgoRoutes = {
  listConversations: (input: ListInput) => Promise<CallResult<unknown>>;
  getConversation: (input: GetInput) => Promise<CallResult<unknown>>;
};

const unavailable: CallResult<unknown> = { kind: 'unavailable', pillar: 'cerebrum' };

function clientOver(routes: Partial<EgoRoutes> = {}) {
  const factory: PillarHandleFactory = <TRouter>() =>
    fakePillarHandle<TRouter>('cerebrum', {
      ego: {
        listConversations: (input) =>
          routes.listConversations?.(input as ListInput) ?? Promise.resolve(unavailable),
        getConversation: (input) =>
          routes.getConversation?.(input as GetInput) ?? Promise.resolve(unavailable),
      },
    });
  return createMobileEgoClient(createPillarGateway(factory));
}

describe('MobileEgoClient.listConversations', () => {
  it('passes the search input unchanged and maps the conversation page', async () => {
    const calls: ListInput[] = [];
    const input = { limit: 17, offset: 4, search: 'quarterly review' };
    const client = clientOver({
      listConversations: (value) => {
        calls.push(value);
        return Promise.resolve({
          kind: 'ok',
          value: {
            conversations: [
              {
                id: 'conversation-1',
                title: null,
                createdAt: '2026-10-01T00:00:00.000Z',
                updatedAt: '2026-10-02T00:00:00.000Z',
                activeScopes: ['finance.read'],
              },
            ],
            total: 1,
          },
        });
      },
    });

    await expect(client.listConversations(input)).resolves.toEqual({
      kind: 'ok',
      value: {
        conversations: [
          {
            id: 'conversation-1',
            title: null,
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-02T00:00:00.000Z',
          },
        ],
        total: 1,
      },
    });
    expect(calls).toEqual([input]);
  });

  it('preserves unavailable and reports malformed upstream bodies as contract mismatches', async () => {
    const failed = await clientOver().listConversations({});
    const malformed = await clientOver({
      listConversations: () => Promise.resolve({ kind: 'ok', value: { wrong: true } }),
    }).listConversations({});

    expect(failed.kind).toBe('unavailable');
    expect(malformed.kind).toBe('contract-mismatch');
  });
});

describe('MobileEgoClient.getConversation', () => {
  it('maps known parts, falls back to content, and drops unsupported roles and parts', async () => {
    const client = clientOver({
      getConversation: () =>
        Promise.resolve({
          kind: 'ok',
          value: {
            conversation: {
              id: 'conversation-1',
              title: 'Review',
              createdAt: '2026-10-01T00:00:00.000Z',
              updatedAt: '2026-10-02T00:00:00.000Z',
              model: 'model-name',
              appContext: null,
            },
            messages: [
              {
                id: 'message-1',
                role: 'assistant',
                content: 'legacy content',
                createdAt: '2026-10-02T00:00:00.000Z',
                parts: [
                  { type: 'text', text: 'Found it.' },
                  { type: 'unknown', anything: true },
                  {
                    type: 'entity',
                    uri: 'pops:finance/transaction/txn-1',
                    title: 'Transaction',
                    subtitle: null,
                  },
                ],
              },
              {
                id: 'message-2',
                role: 'user',
                content: 'A message without parts',
                createdAt: '2026-10-02T00:01:00.000Z',
              },
              {
                id: 'message-3',
                role: 'user',
                content: 'An empty parts array',
                createdAt: '2026-10-02T00:02:00.000Z',
                parts: [],
              },
              {
                id: 'message-4',
                role: 'system',
                content: 'Internal prompt',
                createdAt: '2026-10-02T00:03:00.000Z',
              },
            ],
          },
        }),
    });

    await expect(client.getConversation('conversation-1')).resolves.toEqual({
      kind: 'ok',
      value: {
        conversation: {
          id: 'conversation-1',
          title: 'Review',
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-02T00:00:00.000Z',
        },
        messages: [
          {
            id: 'message-1',
            role: 'assistant',
            createdAt: '2026-10-02T00:00:00.000Z',
            parts: [
              { type: 'text', text: 'Found it.' },
              {
                type: 'entity',
                uri: 'pops:finance/transaction/txn-1',
                title: 'Transaction',
              },
            ],
          },
          {
            id: 'message-2',
            role: 'user',
            createdAt: '2026-10-02T00:01:00.000Z',
            parts: [{ type: 'text', text: 'A message without parts' }],
          },
          {
            id: 'message-3',
            role: 'user',
            createdAt: '2026-10-02T00:02:00.000Z',
            parts: [{ type: 'text', text: 'An empty parts array' }],
          },
        ],
      },
    });
  });

  it('preserves an upstream not-found response', async () => {
    const client = clientOver({
      getConversation: () =>
        Promise.resolve({ kind: 'not-found', pillar: 'cerebrum', message: 'missing' }),
    });

    await expect(client.getConversation('missing')).resolves.toMatchObject({
      kind: 'not-found',
      status: 404,
      pillar: 'cerebrum',
    });
  });
});
