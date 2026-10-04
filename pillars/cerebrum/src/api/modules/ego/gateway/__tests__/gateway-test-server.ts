import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';

import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const TOKEN = 'gateway-test-token';
const inputSchema = { type: 'object' as const, properties: {} };

function buildGateway(): Server {
  const gateway = new Server(
    { name: 'test-gateway', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );
  gateway.setRequestHandler(ListToolsRequestSchema, async (request) => {
    if (request.params?.cursor === 'page-2') {
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
  gateway.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'hang') return new Promise<never>(() => {});
    if (request.params.name === 'plain_thing') {
      return { content: [{ type: 'text' as const, text: 'it broke' }], isError: true };
    }
    const echoed = String(request.params.arguments?.['value'] ?? '');
    return {
      content: [
        { type: 'text' as const, text: `got ${echoed}` },
        { type: 'text' as const, text: 'second' },
      ],
    };
  });
  return gateway;
}

/** Start an offline, authenticated Streamable HTTP gateway for Ego API tests. */
export async function startGatewayTestServer(): Promise<{
  url: string;
  token: string;
  close(): Promise<void>;
}> {
  const app = express();
  app.use(express.json());
  app.post('/mcp', async (req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const gateway = buildGateway();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void gateway.close();
    });
    await gateway.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  let http: HttpServer | undefined;
  await new Promise<void>((resolve, reject) => {
    http = app.listen(0, '127.0.0.1', () => resolve());
    http.once('error', reject);
  });
  if (http === undefined) throw new Error('Gateway test server did not start.');
  const server = http;
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Gateway test server has no TCP address.');
  }

  return {
    url: `http://127.0.0.1:${(address as AddressInfo).port}/mcp`,
    token: TOKEN,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    },
  };
}
