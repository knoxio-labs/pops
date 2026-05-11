/**
 * Platform-neutral result helpers for cerebrum AI tool handlers (PRD-101 US-10).
 *
 * Handlers return `AiToolResult` (the contract defined in `@pops/types`), not
 * the MCP-SDK `CallToolResult`. The MCP dispatcher (see
 * `apps/pops-api/src/mcp/tools/index.ts`) wraps an `AiToolResult` into a
 * `CallToolResult` for the SDK; Ego consumes the platform-neutral shape
 * directly. Keeping these helpers inside the cerebrum module ensures the
 * module owns its AI tool surface without importing from `mcp/`.
 */
import { NotFoundError, ValidationError } from '../../../shared/errors.js';

import type { AiToolResult } from '@pops/types';

/** Canonical error codes surfaced by cerebrum AI tools. */
export type CerebrumToolErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'SCOPE_BLOCKED'
  | 'INTERNAL_ERROR';

/** Build a successful tool result from a JSON-serialisable payload. */
export function toolSuccess(payload: unknown): AiToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  };
}

/** Build a tool error result with a canonical error code. */
export function toolError(message: string, code: CerebrumToolErrorCode): AiToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, code }) }],
    isError: true,
  };
}

/** Map a thrown service-layer error to a tool error result. */
export function mapServiceError(err: unknown): AiToolResult {
  if (err instanceof NotFoundError) {
    return toolError(err.message, 'NOT_FOUND');
  }
  if (err instanceof ValidationError) {
    return toolError(err.message, 'VALIDATION_ERROR');
  }
  const message = err instanceof Error ? err.message : String(err);
  return toolError(message, 'INTERNAL_ERROR');
}
