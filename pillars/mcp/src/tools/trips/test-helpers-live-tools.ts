import { expect, vi } from 'vitest';

import { allTools } from '../index.js';
import { openApiObject } from '../openapi-values.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Invoke the actual registered gateway tool, not a private adapter or producer source import. */
export function callTripTool(
  operation: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const tool = allTools.find((candidate) => candidate.name === `trips.${operation}`);
  if (tool === undefined) throw new Error(`Trips tool not registered: ${operation}`);
  return tool.handler(args);
}

/** Decode an actual successful MCP JSON response while retaining its complete source object. */
export function toolObject(result: CallToolResult): Record<string, unknown> {
  expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
  const first = result.content[0];
  if (first?.type !== 'text') throw new Error('Expected producer JSON tool content');
  const value: unknown = JSON.parse(first.text);
  return openApiObject(value, 'producer response');
}

/** Require the producer-issued numeric identity/revision used by a subsequent explicit command. */
export function numberField(value: Record<string, unknown>, key: string): number {
  const number = value[key];
  if (typeof number !== 'number') throw new Error(`Producer omitted ${key}`);
  return number;
}

/** Read one actual object from a producer's named array; no label-based identity selection is used. */
export function firstRow(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const array = value[key];
  if (!Array.isArray(array) || array.length === 0)
    throw new Error(`Producer omitted ${key} records`);
  return openApiObject(array[0], `${key} first record`);
}

/** Lose one exact producer response after its body completes; no request is suppressed or automatically replayed. */
export function loseCommittedResponse(origin: string, pathname: string): () => boolean {
  const actualFetch = globalThis.fetch;
  let dropped = false;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const response = await actualFetch(input, init);
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!dropped && url.origin === origin && url.pathname === pathname && init?.method === 'POST') {
      dropped = true;
      await response.arrayBuffer();
      throw new Error('Fixture lost the already-committed response');
    }
    return response;
  });
  return () => dropped;
}
