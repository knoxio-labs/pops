import { mapCallResult, ok, toolError } from './utils.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { CallResult } from '@pops/pillar-sdk/client';

import type { MutationOutcome } from './inventory-sync-client.js';

/** Maps a mutation outcome to an applied payload or an actionable MCP tool failure. */
export function itemMutationResult(
  itemId: string,
  result: CallResult<MutationOutcome>
): CallToolResult {
  if (result.kind !== 'ok') return mapCallResult(result);
  const payload = { itemId, outcome: result.value };
  return result.value.status === 'applied' ? ok(payload) : toolError(JSON.stringify(payload));
}
