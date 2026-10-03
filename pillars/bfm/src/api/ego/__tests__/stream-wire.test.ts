import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { readUpstreamFrame, SseReader } from '../stream-wire.js';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../contracts/ego-wire-v1.json'
);
const fixture = z
  .object({
    frames: z.object({
      valid: z.array(z.unknown()).min(1),
      invalid: z.array(z.unknown()).min(1),
      unknown: z.array(z.unknown()).min(1),
    }),
  })
  .parse(JSON.parse(readFileSync(fixturePath, 'utf8')));

function readAll(chunks: readonly Uint8Array[]): string[] {
  const reader = new SseReader();
  return [...chunks.flatMap((chunk) => reader.feed(chunk)), ...reader.finish()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('SseReader', () => {
  it('keeps UTF-8 intact when a multibyte character crosses byte-sized chunks', () => {
    const bytes = new TextEncoder().encode('data: café 🧠\n\n');
    const payloads = readAll(Array.from(bytes, (byte) => Uint8Array.of(byte)));

    expect(payloads).toEqual(['café 🧠']);
  });

  it('joins data lines, ignores comments and metadata, and accepts CRLF and multiple events', () => {
    const reader = new SseReader();

    expect(
      reader.feed(
        new TextEncoder().encode(
          ': heartbeat\r\nevent: token\r\nid: 7\r\ndata: first\r\ndata: second\r\n\r\ndata: next\n\n'
        )
      )
    ).toEqual(['first\nsecond', 'next']);
    expect(reader.finish()).toEqual([]);
  });

  it('holds an event split between chunks and flushes an unterminated tail only on finish', () => {
    const reader = new SseReader();

    expect(reader.feed(new TextEncoder().encode('data: {"text":'))).toEqual([]);
    expect(reader.feed(new TextEncoder().encode('"hello"}'))).toEqual([]);
    expect(reader.finish()).toEqual(['{"text":"hello"}']);
  });

  it('does not emit an event made only of a comment', () => {
    const reader = new SseReader();

    expect(reader.feed(new TextEncoder().encode(': ping\n\n'))).toEqual([]);
    expect(reader.finish()).toEqual([]);
  });
});

describe('readUpstreamFrame', () => {
  it.each(fixture.frames.valid.map((frame, index) => [index, frame] as const))(
    'maps shared valid frame %i',
    (_index, frame) => {
      expect(readUpstreamFrame(JSON.stringify(frame), 'streamed')).toEqual({
        kind: 'frame',
        frame,
      });
    }
  );

  // POPS-5546's shared fixture calls an error without `retryable` invalid, but
  // BFM intentionally accepts that frame and defaults the flag to false.
  const malformedFrames = fixture.frames.invalid.filter(
    (frame) => !isRecord(frame) || frame.type !== 'error' || frame.retryable !== undefined
  );

  it.each(malformedFrames.map((frame) => JSON.stringify(frame)))(
    'marks a known malformed frame as malformed',
    (payload) => {
      expect(readUpstreamFrame(payload, 'streamed').kind).toBe('malformed');
    }
  );

  it.each(fixture.frames.unknown.map((frame) => JSON.stringify(frame)))(
    'skips an unknown frame type',
    (payload) => {
      expect(readUpstreamFrame(payload, 'streamed')).toEqual({ kind: 'skip' });
    }
  );

  it('skips invalid JSON and an unrecognized part', () => {
    expect(readUpstreamFrame('{', '')).toEqual({ kind: 'skip' });
    expect(
      readUpstreamFrame(JSON.stringify({ type: 'part', part: { type: 'future' } }), '')
    ).toEqual({
      kind: 'skip',
    });
  });

  it('treats a missing known field as malformed and falls back to streamed text on done', () => {
    expect(readUpstreamFrame(JSON.stringify({ type: 'token' }), '').kind).toBe('malformed');
    expect(readUpstreamFrame(JSON.stringify({ type: 'part' }), '').kind).toBe('malformed');
    expect(
      readUpstreamFrame(
        JSON.stringify({ type: 'done', conversationId: 'c', messageId: 'm' }),
        'reply'
      )
    ).toEqual({
      kind: 'frame',
      frame: {
        type: 'done',
        conversationId: 'c',
        messageId: 'm',
        parts: [{ type: 'text', text: 'reply' }],
      },
    });
  });

  it('filters unknown done parts and defaults a missing error retryable flag to false', () => {
    expect(
      readUpstreamFrame(
        JSON.stringify({
          type: 'done',
          conversationId: 'c',
          messageId: 'm',
          parts: [{ type: 'unknown' }, { type: 'text', text: 'done' }],
        }),
        'reply'
      )
    ).toMatchObject({
      kind: 'frame',
      frame: { type: 'done', parts: [{ type: 'text', text: 'done' }] },
    });
    expect(readUpstreamFrame(JSON.stringify({ type: 'error', message: 'failed' }), '')).toEqual({
      kind: 'frame',
      frame: { type: 'error', message: 'failed', retryable: false },
    });
  });
});
