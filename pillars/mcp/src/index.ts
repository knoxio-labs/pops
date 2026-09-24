import { config } from 'dotenv';

config();

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express, { type Express } from 'express';

import { shutdownPillar, type ClosableServer } from '@pops/pillar-sdk/bootstrap';
import { assertSecretFilesReadable } from '@pops/pillar-sdk/pillar-env';

import { inboundAuth } from './auth.js';
import { requireServiceAccountKey, resolveServiceAccountKey } from './service-account-key.js';
import { allTools } from './tools/index.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { ToolDef } from './tools/tool-def.js';

/**
 * A tool's listed description, plus the scope it declares (`ToolDef.scope`)
 * when it has one. Advertising the scope in `ListTools` lets an agent (or
 * whoever provisioned its credential) see up front which calls a read-only
 * grant cannot make, rather than discovering it one refused `CallTool` at a
 * time.
 */
export function describeTool(t: ToolDef): string {
  if (t.scope === undefined) return t.description;
  return `${t.description} Requires service-account scope '${t.scope}'.`;
}

/** Structured per-call operational log (CF087) — tool name, ok/error, and latency, so a production issue is visible without re-instrumenting. */
function logToolCall(
  name: string,
  status: 'ok' | 'error',
  latencyMs: number,
  detail?: string
): void {
  const base = `[pops-mcp] tool=${name} status=${status} latencyMs=${latencyMs}`;
  if (status === 'error') {
    console.error(detail ? `${base} error=${detail}` : base);
  } else {
    console.warn(base);
  }
}

export function createMcpServer(): Server {
  const server = new Server({ name: 'pops', version: '1.0.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: describeTool(t),
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: rawArgs } = req.params;
    const start = Date.now();
    const tool = allTools.find((t) => t.name === name);
    if (!tool) {
      logToolCall(name, 'error', Date.now() - start, 'unknown tool');
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }
    const args: Record<string, unknown> = rawArgs ?? {};
    try {
      const result: CallToolResult = await tool.handler(args);
      logToolCall(name, result.isError ? 'error' : 'ok', Date.now() - start);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logToolCall(name, 'error', Date.now() - start, message);
      return {
        content: [{ type: 'text' as const, text: `Tool error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

export const app: Express = express();
app.use(express.json({ limit: '1mb' }));

// EventEmitter listeners cannot be async — an `await` inside one returns a
// promise the emitter discards. If `server.close()` rejected we'd hit
// process.on('unhandledRejection'). Hook the cleanup once and surface failures
// through .catch. Exported so a unit test can exercise the rejection path.
export function attachServerCleanup(
  res: { on: (event: 'close', cb: () => void) => unknown },
  server: { close: () => Promise<void> }
): void {
  res.on('close', () => {
    server.close().catch((err: unknown) => {
      console.error('[pops-mcp] server.close() failed:', err);
    });
  });
}

app.post('/mcp', inboundAuth, async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createMcpServer();

  attachServerCleanup(res, server);

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Liveness vs readiness:
//   /health  — fast, no upstream calls, used by Docker HEALTHCHECK
//   /ready   — verifies POPS_API_KEY is set (the most common misconfig);
//              returns 503 when degraded so orchestrators can route around.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', tools: allTools.length });
});

app.get('/ready', (_req, res) => {
  const apiKeyConfigured = resolveServiceAccountKey() !== undefined;
  res.status(apiKeyConfigured ? 200 : 503).json({
    status: apiKeyConfigured ? 'ready' : 'degraded',
    apiKeyConfigured,
    tools: allTools.length,
  });
});

// Default kept distinct from every other pillar's port (see AGENTS.md's
// pillar/port table) — it used to default to 3002, colliding with inventory.
export const DEFAULT_MCP_PORT = 3011;

export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env['MCP_PORT'];
  if (raw === undefined) {
    return DEFAULT_MCP_PORT;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid MCP_PORT "${raw}": expected an integer TCP port in the range 1–65535.`
    );
  }
  return port;
}

/** Where the shutdown handlers are registered. `process`, outside a test. */
export interface SignalTarget {
  on(signal: 'SIGTERM' | 'SIGINT', handler: (signal: NodeJS.Signals) => void): unknown;
}

/**
 * Register the shutdown handlers this process would otherwise die without.
 *
 * Not a nicety. `CMD ["node", "dist/index.js"]` makes node PID 1, and the
 * kernel applies no default signal disposition to PID 1 — a signal reaches it
 * only if it has installed a handler for that signal. Without this, SIGTERM
 * was discarded and docker SIGKILLed the container once its stop timeout ran
 * out, on 46 of 46 Watchtower restarts (POPS-4219). Measured against
 * node:24-slim as PID 1: `docker stop -t 10` takes 11s with no handler and 0s
 * with one.
 *
 * `shutdownPillar` rather than a hand-rolled close, so the connection draining
 * it grew for POPS-4218 applies here too. mcp registers with nothing and owns
 * no database, so it has no steps and nothing to close after the server.
 */
export function installShutdownHandlers(
  server: ClosableServer,
  target: SignalTarget = process
): void {
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.warn(`[pops-mcp] Shutting down (${signal})`);
    void shutdownPillar({ label: 'pops-mcp', steps: [], server });
  };
  target.on('SIGTERM', shutdown);
  target.on('SIGINT', shutdown);
}

// Only start listening when run directly (not in tests). The key is resolved
// BEFORE listening and is fatal when absent (POPS-2760): every tool proxies a
// pillar, so a keyless process would bind the port, pass its healthcheck and
// fail every call.
if (process.env['NODE_ENV'] !== 'test') {
  // Before the key is resolved. `requireServiceAccountKey` is fatal when no
  // source yields a value, but a `*_FILE` variable naming a file this process
  // cannot open is not that case — the file source falls through to the
  // environment, and the environment may carry something else entirely
  // (POPS-3315).
  assertSecretFilesReadable();
  requireServiceAccountKey();
  const port = resolvePort();
  const server = app.listen(port, '0.0.0.0', () => {
    console.warn(`[pops-mcp] HTTP MCP server on port ${port} (${allTools.length} tools)`);
  });
  installShutdownHandlers(server);
}
