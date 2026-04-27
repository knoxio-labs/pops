/**
 * MCP error formatting — maps service-layer errors to MCP tool responses.
 */
import { NotFoundError, ValidationError } from '../shared/errors.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { McpErrorCode } from './types.js';

/** Build a successful MCP tool response from a JSON-serialisable payload. */
export function mcpSuccess(payload: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  };
}

/** Build an MCP error response. */
export function mcpError(message: string, code: McpErrorCode): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, code }) }],
    isError: true,
  };
}

/** Map a thrown error to an MCP tool error response. */
export function mapServiceError(err: unknown): CallToolResult {
  if (err instanceof NotFoundError) {
    return mcpError(err.message, 'NOT_FOUND');
  }
  if (err instanceof ValidationError) {
    return mcpError(err.message, 'VALIDATION_ERROR');
  }
  const message = err instanceof Error ? err.message : String(err);
  return mcpError(message, 'INTERNAL_ERROR');
}
