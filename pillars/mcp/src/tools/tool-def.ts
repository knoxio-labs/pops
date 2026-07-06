import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Tool['inputSchema'];
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}
