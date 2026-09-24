import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Tool['inputSchema'];
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
  /**
   * The dot-prefixed producer scope (see `hasScopeFor` in
   * `@pops/pillar-sdk/server`) a caller's service account must hold for this
   * tool to succeed, e.g. `inventory.types.manage`. `undefined` when the tool
   * carries no scope of its own — either it proxies an unscoped route, or its
   * producer has not adopted per-route scope enforcement (ADR-044).
   *
   * MCP does not itself hold the caller's grant (the shared `/mcp` bearer
   * token in `auth.ts` authenticates the transport, not a per-caller
   * principal — see ADR-044's note on the `mcp` compose profile's scopes
   * being invisible from this repo), so this field is declarative rather
   * than enforced here: `createMcpServer`'s `ListTools` handler advertises it
   * in the tool description, and the producer is the one that refuses the
   * call. Handlers use it to turn that refusal into an actionable message
   * naming the exact scope to grant, via `mapCallResult`'s `scope` parameter.
   */
  scope?: string;
}
