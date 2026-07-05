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
  ],
}));

// Import schemas and server after mocks are set up
const { ListToolsRequestSchema, CallToolRequestSchema } =
  await import('@modelcontextprotocol/sdk/types.js');
const { createMcpServer, resolvePort, DEFAULT_MCP_PORT } = await import('./index.js');

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
    expect(response.tools).toHaveLength(1);
    expect(response.tools[0]).toMatchObject({
      name: 'test.echo',
      description: 'Echo tool for testing',
      inputSchema: { type: 'object' },
    });
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
