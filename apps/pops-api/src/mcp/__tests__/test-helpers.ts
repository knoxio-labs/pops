/**
 * Shared test helpers for MCP tool tests.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Extract the text content from the first item in a CallToolResult.
 * Assumes the first content item is a text block (which all our tools produce).
 */
export function extractText(result: CallToolResult): string {
  const first = result.content[0];
  if (first && 'text' in first && typeof first.text === 'string') {
    return first.text;
  }
  return '{}';
}

/** Parse the JSON text content from a CallToolResult. */
export function parseResult(result: CallToolResult): unknown {
  return JSON.parse(extractText(result));
}
