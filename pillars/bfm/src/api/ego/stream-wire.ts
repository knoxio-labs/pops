import { z } from 'zod';

import { filterKnownParts } from '../../contract/mobile-ego-schemas.js';

import type { MobileEgoStreamFrameSchema } from '../../contract/mobile-ego-schemas.js';

/** Upstream frame vocabulary currently understood by BFM's Ego relay. */
export const UpstreamEgoFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('token'), text: z.string() }),
  z.object({
    type: z.literal('tool'),
    name: z.string(),
    status: z.enum(['started', 'finished', 'failed']),
  }),
  z.object({ type: z.literal('part'), part: z.unknown() }),
  z.object({ type: z.literal('navigate'), uri: z.string() }),
  z.object({
    type: z.literal('done'),
    conversationId: z.string(),
    messageId: z.string(),
    parts: z.array(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
    retryable: z.boolean().optional(),
  }),
]);

type UpstreamEgoFrame = z.infer<typeof UpstreamEgoFrameSchema>;

/** Result of parsing and mapping one upstream SSE payload. */
export type FrameReading =
  | { kind: 'frame'; frame: z.infer<typeof MobileEgoStreamFrameSchema> }
  | { kind: 'skip' }
  | { kind: 'malformed' };

const KNOWN_FRAME_TYPES = ['token', 'tool', 'part', 'navigate', 'done', 'error'] as const;

/**
 * Incrementally reads server-sent-event data fields from UTF-8 bytes.
 *
 * Lines ending in LF or CRLF are accepted; comments and non-data fields are
 * ignored. Multiple data fields are joined with a newline.
 */
export class SseReader {
  #decoder = new TextDecoder();
  #buffer = '';
  #data: string[] = [];

  /** Consume a byte chunk and return every completed event's data payload. */
  feed(chunk: Uint8Array): string[] {
    this.#buffer += this.#decoder.decode(chunk, { stream: true });
    return this.#readLines(false);
  }

  /** Flush the decoder and return any unterminated final event. */
  finish(): string[] {
    this.#buffer += this.#decoder.decode();
    return this.#readLines(true);
  }

  #readLines(final: boolean): string[] {
    const events: string[] = [];
    let newline = this.#buffer.indexOf('\n');

    while (newline >= 0) {
      const line = this.#buffer.slice(0, newline).replace(/\r$/, '');
      this.#buffer = this.#buffer.slice(newline + 1);
      this.#consumeLine(line, events);
      newline = this.#buffer.indexOf('\n');
    }

    if (final && this.#buffer.length > 0) {
      this.#consumeLine(this.#buffer.replace(/\r$/, ''), events);
      this.#buffer = '';
    }
    if (final) this.#dispatch(events);
    return events;
  }

  #consumeLine(line: string, events: string[]): void {
    if (line.startsWith(':')) return;
    if (line.length === 0) {
      this.#dispatch(events);
      return;
    }

    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    if (field !== 'data') return;

    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    this.#data.push(value);
  }

  #dispatch(events: string[]): void {
    if (this.#data.length === 0) return;
    events.push(this.#data.join('\n'));
    this.#data = [];
  }
}

/** Read a JSON payload and map the upstream frame to BFM's closed wire type. */
export function readUpstreamFrame(payload: string, streamedText: string): FrameReading {
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { kind: 'skip' };
  }

  if (!isRecord(raw) || !isKnownFrameType(raw.type)) return { kind: 'skip' };

  const parsed = UpstreamEgoFrameSchema.safeParse(raw);
  if (!parsed.success) return { kind: 'malformed' };
  if (raw.type === 'part' && !Object.hasOwn(raw, 'part')) return { kind: 'malformed' };

  return mapFrame(parsed.data, streamedText);
}

function mapFrame(frame: UpstreamEgoFrame, streamedText: string): FrameReading {
  switch (frame.type) {
    case 'token':
      return { kind: 'frame', frame: { type: 'token', text: frame.text } };
    case 'tool':
      return {
        kind: 'frame',
        frame: { type: 'tool', name: frame.name, status: frame.status },
      };
    case 'navigate':
      return { kind: 'frame', frame: { type: 'navigate', uri: frame.uri } };
    case 'part': {
      const [part] = filterKnownParts([frame.part]);
      return part === undefined
        ? { kind: 'skip' }
        : { kind: 'frame', frame: { type: 'part', part } };
    }
    case 'done':
      return {
        kind: 'frame',
        frame: {
          type: 'done',
          conversationId: frame.conversationId,
          messageId: frame.messageId,
          parts: frame.parts?.length
            ? filterKnownParts(frame.parts)
            : [{ type: 'text', text: streamedText }],
        },
      };
    case 'error':
      return {
        kind: 'frame',
        frame: {
          type: 'error',
          message: frame.message,
          retryable: frame.retryable ?? false,
        },
      };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKnownFrameType(value: unknown): value is (typeof KNOWN_FRAME_TYPES)[number] {
  return typeof value === 'string' && (KNOWN_FRAME_TYPES as readonly string[]).includes(value);
}
