/**
 * The JSON-parse refusal reshaper, on its own.
 *
 * `../../__tests__/json-body-error.test.ts` drives the real thing through the
 * real app on the two surfaces it covers. This file covers what that one
 * cannot reach as cleanly: a refusal for a DIFFERENT body-parser check, an
 * error that is not a body-parser failure at all, and a path outside the
 * reshaped surface.
 */
import { describe, expect, it, vi } from 'vitest';

import { createJsonBodyErrorHandler } from '../json-body-error.js';

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

/** body-parser's own error shape for a body that failed to parse as JSON. */
function jsonParseFailure(): Record<string, unknown> {
  return { type: 'entity.parse.failed', status: 400 };
}

function handle(error: unknown, path: string) {
  const { res, sent } = recordingResponse();
  const next = vi.fn<(error?: unknown) => void>();

  createJsonBodyErrorHandler()(error, { path }, res, next);

  return { sent, next };
}

describe('a JSON-parse refusal under a device-facing path', () => {
  it('answers the invalid_request shape rather than an empty body', () => {
    const { sent, next } = handle(jsonParseFailure(), '/devices/challenge');

    expect(sent.status).toBe(400);
    expect(sent.body).toEqual({
      code: 'invalid_request',
      message: expect.any(String),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('reshapes it the same way under /mobile', () => {
    const { sent, next } = handle(jsonParseFailure(), '/mobile/purchases/receipts');

    expect(sent.status).toBe(400);
    expect(sent.body).toEqual({ code: 'invalid_request', message: expect.any(String) });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('what it deliberately does not answer', () => {
  it('passes a too-large refusal on, since that is payload-too-large.ts’s job', () => {
    const error = { type: 'entity.too.large', status: 413 };
    const { sent, next } = handle(error, '/mobile/purchases/receipts');

    expect(sent.status).toBeUndefined();
    expect(next).toHaveBeenCalledWith(error);
  });

  it('passes a JSON-parse refusal outside the device-facing surface on, untouched', () => {
    // The operator surface declares no 400 for this. Answering one here would
    // put a status on the wire its contract does not carry.
    const error = jsonParseFailure();
    const { sent, next } = handle(error, '/operator/devices');

    expect(sent.status).toBeUndefined();
    expect(next).toHaveBeenCalledWith(error);
  });

  it('does not treat /mobiles as /mobile', () => {
    const error = jsonParseFailure();
    const { next } = handle(error, '/mobiles');

    expect(next).toHaveBeenCalledWith(error);
  });

  it('passes anything that is not a body-parser failure on', () => {
    for (const error of [undefined, null, 'entity.parse.failed', new Error('boom')]) {
      const { sent, next } = handle(error, '/devices/challenge');

      expect(sent.status).toBeUndefined();
      expect(next).toHaveBeenCalledWith(error);
    }
  });
});
