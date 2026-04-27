/**
 * Shared MCP types for the Cerebrum MCP server.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type { CallToolResult };

/** Canonical error codes returned by MCP tools. */
export type McpErrorCode = 'NOT_FOUND' | 'VALIDATION_ERROR' | 'SCOPE_BLOCKED' | 'INTERNAL_ERROR';

/** Shape of an MCP error payload (serialised as JSON in the text content). */
export interface McpErrorPayload {
  error: string;
  code: McpErrorCode;
}

/** Tool handler function signature. */
export type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;
