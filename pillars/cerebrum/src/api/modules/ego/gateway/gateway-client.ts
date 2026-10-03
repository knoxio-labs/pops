import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/** A tool advertised by the gateway. */
export interface GatewayTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** The MCP `readOnlyHint` annotation exactly as advertised; `undefined` when the tool does not declare it. */
  readOnlyHint: boolean | undefined;
}

/** The outcome of a tool call: its text content joined by newlines and the MCP error flag. */
export interface GatewayCallResult {
  text: string;
  isError: boolean;
}

/** Lists and invokes gateway tools. Transport and timeout failures reject. */
export interface GatewayCaller {
  listTools(): Promise<GatewayTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<GatewayCallResult>;
}

/** Default per-request timeout for gateway calls. */
export const GATEWAY_CALL_TIMEOUT_MS = 20_000;

/** Options for {@link McpGatewayClient}. */
export interface McpGatewayClientOptions {
  url: string;
  token: string;
  timeoutMs?: number;
}

/**
 * MCP client for the stateless POPS gateway. Every call opens its own
 * connection with the bearer token and closes it when the call settles.
 */
export class McpGatewayClient implements GatewayCaller {
  private readonly url: URL;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(options: McpGatewayClientOptions) {
    this.url = new URL(options.url);
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? GATEWAY_CALL_TIMEOUT_MS;
  }

  async listTools(): Promise<GatewayTool[]> {
    return this.withClient(async (client) => {
      const tools: GatewayTool[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.listTools(cursor === undefined ? {} : { cursor }, {
          timeout: this.timeoutMs,
        });
        for (const tool of page.tools) {
          tools.push({
            name: tool.name,
            description: tool.description ?? '',
            inputSchema: { ...tool.inputSchema },
            readOnlyHint: tool.annotations?.readOnlyHint,
          });
        }
        cursor = page.nextCursor;
      } while (cursor !== undefined);
      return tools;
    });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<GatewayCallResult> {
    return this.withClient(async (client) => {
      const result = await client.callTool({ name, arguments: args }, undefined, {
        timeout: this.timeoutMs,
      });
      const content = Array.isArray(result.content) ? result.content : [];
      const text = content
        .flatMap((block) =>
          block.type === 'text' && typeof block.text === 'string' ? [block.text] : []
        )
        .join('\n');
      return { text, isError: result.isError === true };
    });
  }

  private async withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ name: 'pops-ego', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(this.url, {
      requestInit: { headers: { Authorization: `Bearer ${this.token}` } },
    });
    try {
      await client.connect(transport, { timeout: this.timeoutMs });
      return await run(client);
    } finally {
      await client.close();
    }
  }
}
