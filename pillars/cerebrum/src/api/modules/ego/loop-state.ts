import { z } from 'zod';

import type { EgoMessage } from './llm.js';
import type { PausedLoopState } from './tool-loop-types.js';

/** Check persisted model messages against Ego's role and content-block shape. */
export function isEgoMessageList(value: unknown): value is EgoMessage[] {
  try {
    return Array.isArray(value) && value.every(isEgoMessage);
  } catch {
    return false;
  }
}

function isEgoMessage(value: unknown): value is EgoMessage {
  if (typeof value !== 'object' || value === null || !('role' in value) || !('content' in value)) {
    return false;
  }

  if (value.role !== 'user' && value.role !== 'assistant') return false;
  if (typeof value.content === 'string') return true;
  if (!Array.isArray(value.content)) return false;

  return value.content.every(
    (block: unknown) =>
      typeof block === 'object' &&
      block !== null &&
      'type' in block &&
      typeof block.type === 'string'
  );
}

const loopToolResultSchema = z.union([
  z.object({
    toolUseId: z.string(),
    content: z.string(),
    isError: z.boolean(),
  }),
  z.object({
    toolUseId: z.string(),
    actionId: z.string(),
  }),
]);

const pausedLoopStateSchema = z.object({
  system: z.string(),
  messages: z.custom<EgoMessage[]>(isEgoMessageList),
  round: z.number().int().nonnegative(),
  results: z.array(loopToolResultSchema),
});

/** Parse an untrusted saved loop state, returning null for malformed data. */
export function parsePausedLoopState(value: unknown): PausedLoopState | null {
  try {
    const parsed = pausedLoopStateSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
