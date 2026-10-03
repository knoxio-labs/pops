import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { McpGatewayClient } from '../gateway-client.js';

import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const TOKEN = 'gateway-test-token';
const inputSchema = { type: 'object' as const, properties: {} };

function buildServer(): Server {
  const server = new Server(
    { name: 'test-gateway', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async (req) => {
    if (req.params?.cursor === 'page-2') {
      return { tools: [{ name: 'hang', description: 'never resolves', inputSchema }] };
    }
    return {
      tools: [
        {
          name: 'read_thing',
          description: 'reads',
          inputSchema,
          annotations: { readOnlyHint: true },
        },
        { name: 'plain_thing', description: 'plain', inputSchema },
      ],
      nextCursor: 'page-2',
    };
  });
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name === 'hang') return new Promise<never>(() => {});
    if (req.params.name === 'plain_thing') {
      return { content: [{ type: 'text' as const, text: 'it broke' }], isError: true };
    }
    const echoed = String(req.params.arguments?.['value'] ?? '');
    return {
      content: [
        { type: 'text' as const, text: `got ${echoed}` },
        { type: 'text' as const, text: 'second' },
      ],
    };
  });
  return server;
}

let http: HttpServer;
let url: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.post('/mcp', async (req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  await new Promise<void>((resolve) => {
    http = app.listen(0, '127.0.0.1', () => resolve());
  });
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;
});

afterAll(async () => {
  http.closeAllConnections();
  await new Promise<void>((resolve) => http.close(() => resolve()));
});

describe('McpGatewayClient', () => {
  it('follows pagination and carries readOnlyHint through unchanged', async () => {
    const tools = await new McpGatewayClient({ url, token: TOKEN }).listTools();
    expect(tools.map((t) => [t.name, t.readOnlyHint])).toEqual([
      ['read_thing', true],
      ['plain_thing', undefined],
      ['hang', undefined],
    ]);
    expect(tools[0]?.description).toBe('reads');
  });

  it('joins text blocks and returns the handler text', async () => {
    const result = await new McpGatewayClient({ url, token: TOKEN }).callTool('read_thing', {
      value: 'x',
    });
    expect(result).toEqual({ text: 'got x\nsecond', isError: false });
  });

  it('maps isError', async () => {
    const result = await new McpGatewayClient({ url, token: TOKEN }).callTool('plain_thing', {});
    expect(result).toEqual({ text: 'it broke', isError: true });
  });

  it('rejects with a wrong token', async () => {
    await expect(new McpGatewayClient({ url, token: 'wrong' }).listTools()).rejects.toThrow();
  });

  it('rejects a hanging tool within the timeout', async () => {
    const started = Date.now();
    await expect(
      new McpGatewayClient({ url, token: TOKEN, timeoutMs: 200 }).callTool('hang', {})
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
