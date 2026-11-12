import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';

import { performRestCall } from '@pops/pillar-sdk/client';

import { mapCallResult, ok } from './utils.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

async function performDelete(
  status: number,
  body: string | null = null
): Promise<{
  result: CallToolResult;
  methods: string[];
}> {
  const methods: string[] = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    methods.push(init?.method ?? 'GET');
    return new Response(body, { status });
  };
  const result = await performRestCall({
    pillarId: 'trips',
    discovered: {
      pillarId: 'trips',
      baseUrl: 'http://trips.test',
      status: 'healthy',
      registered: true,
      lastSeenAt: '2026-11-12T00:00:00.000Z',
      manifest: {
        pillar: 'trips',
        version: '1.0.0',
        contract: { package: '@pops/trips', version: '1.0.0', tag: 'contract-trips@v1.0.0' },
        routes: {
          queries: [],
          mutations: ['trips.documentAssociations.delete'],
          subscriptions: [],
        },
        search: { adapters: [] },
        ai: { tools: [] },
        uri: { types: [] },
        consumedSettings: { keys: [] },
        healthcheck: { path: '/health' },
      },
    },
    path: ['documentAssociations', 'delete'],
    input: { tripId: 7, id: 3 },
    routes: {
      paths: {
        '/trips/{tripId}/document-associations/{id}': {
          delete: {
            operationId: 'documentAssociations.delete',
            parameters: [
              { name: 'tripId', in: 'path' },
              { name: 'id', in: 'path' },
            ],
          },
        },
      },
    },
    fetchImpl,
  });
  return { result: mapCallResult(result, 'trips.documentAssociations.delete'), methods };
}

describe('no-content REST success at the MCP boundary', () => {
  it('maps an actual HTTP204 SDK result to valid empty MCP content without fabricating JSON', async () => {
    const { result, methods } = await performDelete(204);
    expect(result).toEqual({ content: [] });
    expect(CallToolResultSchema.safeParse(result).success).toBe(true);
    expect(methods).toEqual(['DELETE']);
  });

  it.each([null, false, 0, { value: 'recorded' }])('preserves explicit JSON value %j', (value) => {
    const result = ok(value);
    expect(result).toEqual({ content: [{ type: 'text', text: JSON.stringify(value) }] });
    expect(CallToolResultSchema.safeParse(result).success).toBe(true);
  });

  it('keeps malformed successful JSON as an error without replaying the mutation', async () => {
    const { result, methods } = await performDelete(200, 'not JSON');
    expect(result.isError).toBe(true);
    expect(result.content).not.toEqual([]);
    expect(CallToolResultSchema.safeParse(result).success).toBe(true);
    expect(methods).toEqual(['DELETE']);
  });

  it('preserves an actual authorization error and its producer metadata', async () => {
    const { result, methods } = await performDelete(
      403,
      JSON.stringify({
        message: 'Missing grant',
        code: 'trips.service_account.forbidden',
        requiredScope: 'trips.documentAssociations.delete',
      })
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('trips.service_account.forbidden');
    expect(JSON.stringify(result.content)).toContain('trips.documentAssociations.delete');
    expect(CallToolResultSchema.safeParse(result).success).toBe(true);
    expect(methods).toEqual(['DELETE']);
  });
});
