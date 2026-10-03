import { isRecord, parseMessagePart, parseMessageParts } from './message-parts';

import type { MessagePart } from './message-parts';
import type { RetrievedEngram, ToolStatus } from './types';
export type { ToolStatus } from './types';

/** One server-sent frame of the Ego chat stream. */
export type StreamFrame =
  | { type: 'token'; text: string }
  | { type: 'tool'; name: string; status: ToolStatus }
  | { type: 'part'; part: MessagePart }
  | { type: 'navigate'; uri: string }
  | {
      type: 'done';
      conversationId: string;
      messageId: string | null;
      retrievedEngrams: RetrievedEngram[];
      parts: MessagePart[];
    }
  | { type: 'error'; message: string };

const DATA_PREFIX = 'data: ';
const TOOL_STATUSES: readonly ToolStatus[] = ['started', 'finished', 'failed'];

function isToolStatus(value: unknown): value is ToolStatus {
  return TOOL_STATUSES.some((status) => status === value);
}

function parseEngrams(raw: unknown): RetrievedEngram[] {
  if (!Array.isArray(raw)) return [];
  const engrams: RetrievedEngram[] = [];
  for (const entry of raw) {
    if (
      isRecord(entry) &&
      typeof entry.engramId === 'string' &&
      typeof entry.relevanceScore === 'number'
    ) {
      engrams.push({ engramId: entry.engramId, relevanceScore: entry.relevanceScore });
    }
  }
  return engrams;
}

function parseToolFrame(raw: Record<string, unknown>): StreamFrame | null {
  if (typeof raw.name !== 'string' || !isToolStatus(raw.status)) return null;
  return { type: 'tool', name: raw.name, status: raw.status };
}

function parsePartFrame(raw: Record<string, unknown>): StreamFrame | null {
  const part = parseMessagePart(raw.part);
  return part ? { type: 'part', part } : null;
}

function parseDoneFrame(raw: Record<string, unknown>): StreamFrame | null {
  if (typeof raw.conversationId !== 'string') return null;
  return {
    type: 'done',
    conversationId: raw.conversationId,
    messageId: typeof raw.messageId === 'string' ? raw.messageId : null,
    retrievedEngrams: parseEngrams(raw.retrievedEngrams),
    parts: parseMessageParts(raw.parts),
  };
}

function parseFrameObject(raw: Record<string, unknown>): StreamFrame | null {
  switch (raw.type) {
    case 'token':
      return typeof raw.text === 'string' ? { type: 'token', text: raw.text } : null;
    case 'navigate':
      return typeof raw.uri === 'string' ? { type: 'navigate', uri: raw.uri } : null;
    case 'tool':
      return parseToolFrame(raw);
    case 'part':
      return parsePartFrame(raw);
    case 'done':
      return parseDoneFrame(raw);
    case 'error':
      return {
        type: 'error',
        message: typeof raw.message === 'string' ? raw.message : 'Stream failed',
      };
    default:
      return null;
  }
}

/**
 * Parses one `data: ` line of the chat stream. Returns null when the prefix is
 * missing, the JSON is malformed or not an object, the frame type is unknown, or a
 * required field is invalid. A `done` frame tolerates absent `messageId`, `parts`
 * and `retrievedEngrams`, and drops invalid parts and engrams individually.
 */
export function parseStreamFrame(line: string): StreamFrame | null {
  if (!line.startsWith(DATA_PREFIX)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(line.slice(DATA_PREFIX.length));
  } catch {
    return null;
  }
  return isRecord(raw) ? parseFrameObject(raw) : null;
}
