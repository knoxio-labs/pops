/**
 * The body-parser refusal reshaper, on its own.
 *
 * `../../__tests__/mobile-receipts.test.ts` drives the real thing through the
 * real app on the one route that can currently trip it. This file covers what
 * that route cannot reach: a refusal from a DIFFERENT parser mount, an error
 * that is not a size refusal at all, and a path outside `/mobile`. Two parsers
 * cover this pillar — the upload path's raised limit and Express's 100kb
 * default — and a handler that reported one ceiling for both would tell a
 * caller refused at 100kb to try again with twelve megabytes.
 */
import { describe, expect, it, vi } from 'vitest';

import { MOBILE_UPLOAD_MAX_BYTES } from '../../../contract/rest-schemas.js';
import { createPayloadTooLargeErrorHandler } from '../payload-too-large.js';

/** A response that records rather than sends. */
function recordingResponse() {
  const sent: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
      return this;
    },
  };

  return { res, sent };
}

/** body-parser's own error shape for a body past `limit`. */
function tooLarge(limit?: number): Record<string, unknown> {
  return limit === undefined
    ? { type: 'entity.too.large', status: 413 }
    : { type: 'entity.too.large', status: 413, limit, length: limit + 1 };
}

function handle(error: unknown, path: string) {
  const { res, sent } = recordingResponse();
  const next = vi.fn<(error?: unknown) => void>();

  createPayloadTooLargeErrorHandler()(error, { path }, res, next);

  return { sent, next };
}

describe('a size refusal under /mobile', () => {
  it('answers the contract shape rather than an HTML page', () => {
    const { sent, next } = handle(tooLarge(MOBILE_UPLOAD_MAX_BYTES), '/mobile/purchases/receipts');

    expect(sent.status).toBe(413);
    expect(sent.body).toEqual({
      code: 'payload_too_large',
      maxBytes: MOBILE_UPLOAD_MAX_BYTES,
      message: expect.any(String),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('reports the ceiling the parser that refused it was mounted with', () => {
    // The default parser covers every mobile route the upload mount does not.
    // Reporting 12mb here would be an instruction the caller cannot follow.
    const { sent } = handle(tooLarge(100 * 1024), '/mobile/somewhere/else');

    expect(sent.status).toBe(413);
    expect(sent.body).toEqual({
      code: 'payload_too_large',
      maxBytes: 100 * 1024,
      message: expect.any(String),
    });
  });

  it('falls back to this pillar’s own mount when the error carries no limit', () => {
    const { sent } = handle(tooLarge(), '/mobile/purchases/receipts');

    expect(sent.body).toMatchObject({ maxBytes: MOBILE_UPLOAD_MAX_BYTES });
  });

  it('ignores a limit that is not a usable byte count', () => {
    // The field is required by the schema the client is generated from, so a
    // `null`, a string or a zero must not reach the wire as one.
    for (const limit of [null, '100kb', 0, -1, 1.5]) {
      const { sent } = handle({ type: 'entity.too.large', limit }, '/mobile/purchases/receipts');

      expect(sent.body).toMatchObject({ maxBytes: MOBILE_UPLOAD_MAX_BYTES });
    }
  });
});

describe('what it deliberately does not answer', () => {
  it('passes a malformed-JSON refusal on, since that is a 400', () => {
    const error = { type: 'entity.parse.failed', status: 400 };
    const { sent, next } = handle(error, '/mobile/purchases/receipts');

    expect(sent.status).toBeUndefined();
    expect(next).toHaveBeenCalledWith(error);
  });

  it('passes a size refusal outside /mobile on, untouched', () => {
    // The operator and device surfaces declare no 413. Answering one here
    // would put a status on the wire their contracts do not carry.
    const error = tooLarge(1024);
    const { sent, next } = handle(error, '/operator/devices');

    expect(sent.status).toBeUndefined();
    expect(next).toHaveBeenCalledWith(error);
  });

  it('does not treat /mobiles as /mobile', () => {
    const error = tooLarge(1024);
    const { next } = handle(error, '/mobiles');

    expect(next).toHaveBeenCalledWith(error);
  });

  it('passes anything that is not an object on', () => {
    for (const error of [undefined, null, 'entity.too.large', new Error('boom')]) {
      const { sent, next } = handle(error, '/mobile/purchases/receipts');

      expect(sent.status).toBeUndefined();
      expect(next).toHaveBeenCalledWith(error);
    }
  });
});
