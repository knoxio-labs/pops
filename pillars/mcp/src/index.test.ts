import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Set env before any imports so startup code doesn't throw
process.env['POPS_API_KEY'] = 'sa_test';
process.env['NODE_ENV'] = 'test';

// Capture handlers registered on Server so we can call them directly
type HandlerFn = (req: { params: Record<string, unknown> }) => Promise<unknown>;
const capturedHandlers = new Map<unknown, HandlerFn>();

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  // Must use class/function (not arrow) so `new Server(...)` works
  Server: class {
    setRequestHandler(schema: unknown, handler: HandlerFn) {
      // Use schema object reference as key so caller can look up by schema
      capturedHandlers.set(schema, handler);
    }
    connect = vi.fn();
    close = vi.fn();
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class {
    handleRequest = vi.fn();
  },
}));

vi.mock('dotenv', () => ({ config: vi.fn() }));

const { mockListen, mockGet } = vi.hoisted(() => ({ mockListen: vi.fn(), mockGet: vi.fn() }));

vi.mock('express', () => {
  const express = Object.assign(
    vi.fn(() => ({ use: vi.fn(), post: vi.fn(), get: mockGet, listen: mockListen })),
    { json: vi.fn(() => vi.fn()) }
  );
  return { default: express };
});

const mockToolHandler = vi.fn().mockResolvedValue({
  content: [{ type: 'text', text: '{"ok":true}' }],
});

vi.mock('./tools/index.js', () => ({
  allTools: [
    {
      name: 'test.echo',
      description: 'Echo tool for testing',
      inputSchema: { type: 'object', properties: {} },
      handler: mockToolHandler,
    },
    {
      name: 'test.scoped',
      description: 'Scoped tool for testing',
      inputSchema: { type: 'object', properties: {} },
      handler: mockToolHandler,
      scope: 'inventory.types.manage',
    },
    {
      name: 'test.readonly',
      description: 'Read-only tool for testing',
      inputSchema: { type: 'object', properties: {} },
      handler: mockToolHandler,
      readOnly: true,
    },
  ],
}));

// Import schemas and server after mocks are set up
const { ListToolsRequestSchema, CallToolRequestSchema } =
  await import('@modelcontextprotocol/sdk/types.js');
const { createMcpServer, resolvePort, DEFAULT_MCP_PORT } = await import('./index.js');

type ReadyResponse = {
  status: (status: number) => ReadyResponse;
  json: (body: Record<string, unknown>) => void;
};

const INVENTORY_PORT = 3002;

describe('resolvePort', () => {
  it('defaults to a port that does not collide with the inventory pillar', () => {
    expect(resolvePort({})).toBe(DEFAULT_MCP_PORT);
    expect(resolvePort({})).not.toBe(INVENTORY_PORT);
  });

  it('honors an explicit MCP_PORT override', () => {
    expect(resolvePort({ MCP_PORT: '4100' })).toBe(4100);
  });

  it.each(['', '   ', 'abc', '0', '-1', '65536', '3011.5'])(
    'throws on invalid MCP_PORT value %j',
    (value) => {
      expect(() => resolvePort({ MCP_PORT: value })).toThrow(/Invalid MCP_PORT/);
    }
  );
});

describe('MCP readiness', () => {
  it('requires both outbound credentials and inbound bearer authentication', () => {
    const readyRoute = mockGet.mock.calls.find((call) => call[0] === '/ready')?.[1] as
      | ((request: unknown, response: ReadyResponse) => void)
      | undefined;
    expect(readyRoute).toBeDefined();
    const status = vi.fn<(status: number) => ReadyResponse>();
    const json = vi.fn<(body: Record<string, unknown>) => void>();
    status.mockImplementation(() => ({ status, json }));
    const response: ReadyResponse = { status, json };

    delete process.env['MCP_INBOUND_TOKEN'];
    delete process.env['MCP_INBOUND_TOKEN_FILE'];
    readyRoute?.({}, response);
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'degraded', inboundAuthConfigured: false })
    );

    status.mockClear();
    json.mockClear();
    process.env['MCP_INBOUND_TOKEN'] = 'readiness-test-token';
    readyRoute?.({}, response);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'ready', inboundAuthConfigured: true })
    );
    delete process.env['MCP_INBOUND_TOKEN'];
  });
});

describe('createMcpServer — ListTools handler', () => {
  beforeEach(() => {
    capturedHandlers.clear();
    createMcpServer();
  });

  it('registers a ListTools handler', () => {
    expect(capturedHandlers.has(ListToolsRequestSchema)).toBe(true);
  });

  it('returns all registered tools with name, description, and inputSchema', async () => {
    const handler = capturedHandlers.get(ListToolsRequestSchema)!;
    const response = (await handler({ params: {} })) as {
      tools: { name: string; description: string; inputSchema: unknown }[];
    };
    expect(response.tools).toHaveLength(3);
    expect(response.tools[0]).toMatchObject({
      name: 'test.echo',
      description: 'Echo tool for testing',
      inputSchema: { type: 'object' },
    });
  });

  it("advertises a scoped tool's required scope in its listed description", async () => {
    const handler = capturedHandlers.get(ListToolsRequestSchema)!;
    const response = (await handler({ params: {} })) as {
      tools: { name: string; description: string }[];
    };
    const scoped = response.tools.find((t) => t.name === 'test.scoped');
    expect(scoped?.description).toBe(
      "Scoped tool for testing Requires service-account scope 'inventory.types.manage'."
    );
  });
});

describe('createMcpServer — ListTools annotations', () => {
  beforeEach(() => {
    capturedHandlers.clear();
    createMcpServer();
  });

  it('advertises readOnlyHint true only for a tool that sets readOnly', async () => {
    const handler = capturedHandlers.get(ListToolsRequestSchema)!;
    const response = (await handler({ params: {} })) as {
      tools: { name: string; annotations?: unknown }[];
    };
    const byName = new Map(response.tools.map((t) => [t.name, t.annotations]));
    expect(byName.get('test.readonly')).toEqual({ readOnlyHint: true });
    expect(byName.get('test.echo')).toEqual({ readOnlyHint: false });
    expect(byName.get('test.scoped')).toEqual({ readOnlyHint: false });
  });
});

describe('createMcpServer — CallTool handler', () => {
  beforeEach(() => {
    capturedHandlers.clear();
    mockToolHandler.mockClear();
    createMcpServer();
  });

  it('registers a CallTool handler', () => {
    expect(capturedHandlers.has(CallToolRequestSchema)).toBe(true);
  });

  it('dispatches to the correct tool handler', async () => {
    const handler = capturedHandlers.get(CallToolRequestSchema)!;
    const response = (await handler({
      params: { name: 'test.echo', arguments: { key: 'value' } },
    })) as { content: { text: string }[]; isError?: boolean };

    expect(mockToolHandler).toHaveBeenCalledWith({ key: 'value' });
    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toBe('{"ok":true}');
  });

  it('returns isError for unknown tool names', async () => {
    const handler = capturedHandlers.get(CallToolRequestSchema)!;
    const response = (await handler({
      params: { name: 'no.such.tool', arguments: {} },
    })) as { content: { text: string }[]; isError?: boolean };

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain('no.such.tool');
  });

  it('wraps tool exceptions as isError responses', async () => {
    mockToolHandler.mockRejectedValueOnce(new Error('upstream failed'));
    const handler = capturedHandlers.get(CallToolRequestSchema)!;
    const response = (await handler({
      params: { name: 'test.echo', arguments: {} },
    })) as { content: { text: string }[]; isError?: boolean };

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain('upstream failed');
  });

  it('passes empty object when arguments is undefined', async () => {
    const handler = capturedHandlers.get(CallToolRequestSchema)!;
    await handler({ params: { name: 'test.echo' } });
    expect(mockToolHandler).toHaveBeenCalledWith({});
  });
});

describe('createMcpServer — CallTool structured logging (CF087)', () => {
  beforeEach(() => {
    capturedHandlers.clear();
    mockToolHandler.mockClear();
    createMcpServer();
  });

  it('logs tool=<name> status=ok with a latency on success', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handler = capturedHandlers.get(CallToolRequestSchema)!;

    await handler({ params: { name: 'test.echo', arguments: {} } });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/tool=test\.echo status=ok latencyMs=\d+/)
    );
    warnSpy.mockRestore();
  });

  it('logs tool=<name> status=error with the failure message on a thrown exception', async () => {
    mockToolHandler.mockRejectedValueOnce(new Error('upstream failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = capturedHandlers.get(CallToolRequestSchema)!;

    await handler({ params: { name: 'test.echo', arguments: {} } });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/tool=test\.echo status=error latencyMs=\d+ error=upstream failed/)
    );
    errorSpy.mockRestore();
  });

  it('logs tool=<name> status=error for a result that carries isError', async () => {
    mockToolHandler.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'bad request' }],
      isError: true,
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = capturedHandlers.get(CallToolRequestSchema)!;

    await handler({ params: { name: 'test.echo', arguments: {} } });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/tool=test\.echo status=error latencyMs=\d+/)
    );
    errorSpy.mockRestore();
  });

  it('logs an unknown-tool call as an error with no latency crash', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = capturedHandlers.get(CallToolRequestSchema)!;

    await handler({ params: { name: 'no.such.tool', arguments: {} } });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/tool=no\.such\.tool status=error latencyMs=\d+ error=unknown tool/)
    );
    errorSpy.mockRestore();
  });
});

describe('inbound token startup validation', () => {
  it.each(['missing', 'empty', 'malformed'])(
    'rejects a %s configured token file before listening',
    async (kind) => {
      const dir = mkdtempSync(join(tmpdir(), 'mcp-inbound-token-startup-'));
      const tokenFile = join(dir, 'token');
      if (kind === 'empty') writeFileSync(tokenFile, '  \n');
      if (kind === 'malformed') writeFileSync(tokenFile, 'first-token\nsecond-token');
      const configuredPath = kind === 'missing' ? join(dir, 'missing-token') : tokenFile;
      const previousEnv = {
        nodeEnv: process.env['NODE_ENV'],
        tokenFile: process.env['MCP_INBOUND_TOKEN_FILE'],
        token: process.env['MCP_INBOUND_TOKEN'],
      };

      try {
        vi.resetModules();
        mockListen.mockClear();
        process.env['NODE_ENV'] = 'production';
        process.env['MCP_INBOUND_TOKEN_FILE'] = configuredPath;
        process.env['MCP_INBOUND_TOKEN'] = 'test-fallback-token';

        let startupError: unknown;
        try {
          await import('./index.js');
        } catch (error) {
          startupError = error;
        }
        expect(startupError).toBeInstanceOf(Error);
        expect((startupError as Error).message).toContain('MCP_INBOUND_TOKEN_FILE');
        expect((startupError as Error).message).not.toContain(configuredPath);
        expect((startupError as Error).message).not.toContain('test-fallback-token');
        expect(mockListen).not.toHaveBeenCalled();
      } finally {
        if (previousEnv.nodeEnv === undefined) delete process.env['NODE_ENV'];
        else process.env['NODE_ENV'] = previousEnv.nodeEnv;
        if (previousEnv.tokenFile === undefined) delete process.env['MCP_INBOUND_TOKEN_FILE'];
        else process.env['MCP_INBOUND_TOKEN_FILE'] = previousEnv.tokenFile;
        if (previousEnv.token === undefined) delete process.env['MCP_INBOUND_TOKEN'];
        else process.env['MCP_INBOUND_TOKEN'] = previousEnv.token;
        vi.resetModules();
        rmSync(dir, { force: true, recursive: true });
      }
    }
  );

  it.each([undefined, '', '   '])(
    'rejects a missing or blank inbound token before listening (%j)',
    async (token) => {
      const previousEnv = {
        nodeEnv: process.env['NODE_ENV'],
        tokenFile: process.env['MCP_INBOUND_TOKEN_FILE'],
        token: process.env['MCP_INBOUND_TOKEN'],
      };

      try {
        vi.resetModules();
        mockListen.mockClear();
        process.env['NODE_ENV'] = 'production';
        delete process.env['MCP_INBOUND_TOKEN_FILE'];
        if (token === undefined) delete process.env['MCP_INBOUND_TOKEN'];
        else process.env['MCP_INBOUND_TOKEN'] = token;

        await expect(import('./index.js')).rejects.toThrow(/inbound authentication is required/);
        expect(mockListen).not.toHaveBeenCalled();
      } finally {
        if (previousEnv.nodeEnv === undefined) delete process.env['NODE_ENV'];
        else process.env['NODE_ENV'] = previousEnv.nodeEnv;
        if (previousEnv.tokenFile === undefined) delete process.env['MCP_INBOUND_TOKEN_FILE'];
        else process.env['MCP_INBOUND_TOKEN_FILE'] = previousEnv.tokenFile;
        if (previousEnv.token === undefined) delete process.env['MCP_INBOUND_TOKEN'];
        else process.env['MCP_INBOUND_TOKEN'] = previousEnv.token;
        vi.resetModules();
      }
    }
  );

  it('rejects a malformed environment token without echoing it or listening', async () => {
    const previousEnv = {
      nodeEnv: process.env['NODE_ENV'],
      tokenFile: process.env['MCP_INBOUND_TOKEN_FILE'],
      token: process.env['MCP_INBOUND_TOKEN'],
    };
    const malformedToken = 'secret-with whitespace';

    try {
      vi.resetModules();
      mockListen.mockClear();
      process.env['NODE_ENV'] = 'production';
      delete process.env['MCP_INBOUND_TOKEN_FILE'];
      process.env['MCP_INBOUND_TOKEN'] = malformedToken;

      let startupError: unknown;
      try {
        await import('./index.js');
      } catch (error) {
        startupError = error;
      }
      expect(startupError).toBeInstanceOf(Error);
      expect((startupError as Error).message).toContain('MCP_INBOUND_TOKEN');
      expect((startupError as Error).message).not.toContain(malformedToken);
      expect(mockListen).not.toHaveBeenCalled();
    } finally {
      if (previousEnv.nodeEnv === undefined) delete process.env['NODE_ENV'];
      else process.env['NODE_ENV'] = previousEnv.nodeEnv;
      if (previousEnv.tokenFile === undefined) delete process.env['MCP_INBOUND_TOKEN_FILE'];
      else process.env['MCP_INBOUND_TOKEN_FILE'] = previousEnv.tokenFile;
      if (previousEnv.token === undefined) delete process.env['MCP_INBOUND_TOKEN'];
      else process.env['MCP_INBOUND_TOKEN'] = previousEnv.token;
      vi.resetModules();
    }
  });
});
