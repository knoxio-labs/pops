import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';

import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type {
  CallToolResult as McpCallToolResult,
  Tool as McpTool,
} from '@modelcontextprotocol/sdk/types.js';

const TOKEN = 'gateway-test-token';
const inputSchema = { type: 'object' as const, properties: {} };

export interface GatewayTestCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GatewayTestServerOptions {
  /** Override the default paginated catalogue with a focused tool fixture. */
  tools?: readonly McpTool[];
  /** Return MCP text results for calls while the helper records each invocation. */
  onCall?: (call: GatewayTestCall) => Promise<McpCallToolResult> | McpCallToolResult;
}

function buildGateway(options: GatewayTestServerOptions, calls: GatewayTestCall[]): Server {
  const gateway = new Server(
    { name: 'test-gateway', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );
  gateway.setRequestHandler(ListToolsRequestSchema, async (request) => {
    if (options.tools !== undefined) return { tools: [...options.tools] };
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
    const call = {
      name: request.params.name,
      args: request.params.arguments ?? {},
    };
    calls.push(call);
    if (options.onCall !== undefined) return options.onCall(call);
    if (call.name === 'hang') return new Promise<never>(() => {});
    if (call.name === 'plain_thing') {
      return { content: [{ type: 'text' as const, text: 'it broke' }], isError: true };
    }
    const echoed = String(call.args['value'] ?? '');
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
export async function startGatewayTestServer(options: GatewayTestServerOptions = {}): Promise<{
  url: string;
  token: string;
  calls: GatewayTestCall[];
  close(): Promise<void>;
}> {
  const calls: GatewayTestCall[] = [];
  const app = express();
  app.use(express.json());
  app.post('/mcp', async (req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const gateway = buildGateway(options, calls);
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
    calls,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    },
  };
}
