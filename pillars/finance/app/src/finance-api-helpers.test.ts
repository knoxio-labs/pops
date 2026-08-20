/**
 * Tests for the finance SDK result unwrapper, focused on the message a user
 * ends up reading.
 *
 * The case that motivated these: a 3231-row import exceeded nginx's body limit,
 * and the proxy answered 413 with an HTML error page. With no `message` field
 * to read, every such failure collapsed to the same "finance API request
 * failed" — the status was captured on the error object but never surfaced, so
 * the screen could not distinguish "too large" from "service down".
 */
import { describe, expect, it } from 'vitest';

import { FinanceApiError, isUnavailableError, unwrap } from './finance-api-helpers';

function failure(status: number | undefined, error: unknown = {}) {
  return {
    error,
    response: status === undefined ? undefined : ({ status } as Response),
  };
}

describe('unwrap — failures with no usable body', () => {
  it('names the condition for a proxy-rejected oversized request', () => {
    expect(() => unwrap(failure(413))).toThrow(
      'finance API request failed: the request was too large for the server to accept (HTTP 413)'
    );
  });

  it.each([
    [502, 'the finance service is unreachable'],
    [503, 'the finance service is unavailable'],
    [504, 'the finance service timed out'],
    [429, 'too many requests — try again shortly'],
    [401, 'not authorised'],
    [404, 'not found'],
  ])('describes %i', (status, reason) => {
    expect(() => unwrap(failure(status))).toThrow(`${reason} (HTTP ${status})`);
  });

  it('still names the status for an unmapped code', () => {
    // The point is that two different failures never read identically.
    expect(() => unwrap(failure(418))).toThrow('finance API request failed (HTTP 418)');
  });

  it('distinguishes a no-response failure from a status failure', () => {
    expect(() => unwrap(failure(undefined))).toThrow(
      'finance API request failed — no response from the server'
    );
  });

  it('gives two different statuses two different messages', () => {
    const messageFor = (status: number) => {
      try {
        unwrap(failure(status));
      } catch (err) {
        return (err as Error).message;
      }
      throw new Error('expected a throw');
    };
    expect(messageFor(413)).not.toBe(messageFor(503));
  });

  it('ignores an HTML error page body rather than treating it as a message', () => {
    // nginx answers 413 with `<html>...` — not an object with `message`.
    expect(() =>
      unwrap(failure(413, '<html><body>413 Request Entity Too Large</body></html>'))
    ).toThrow('the request was too large for the server to accept (HTTP 413)');
  });
});

describe('unwrap — failures that do carry a body', () => {
  it('prefers the API-supplied message over the status description', () => {
    expect(() => unwrap(failure(413, { message: 'Import exceeds the 500-row limit' }))).toThrow(
      'Import exceeds the 500-row limit'
    );
  });

  it('falls back when the message is present but empty', () => {
    expect(() => unwrap(failure(503, { message: '' }))).toThrow('HTTP 503');
  });

  it('preserves the status on the thrown error', () => {
    try {
      unwrap(failure(413));
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(FinanceApiError);
      expect((err as FinanceApiError).status).toBe(413);
    }
  });
});

describe('unwrap — success', () => {
  it('returns the data', () => {
    expect(unwrap({ data: { id: 'x' } })).toEqual({ id: 'x' });
  });

  it('throws when the call succeeded but carried no data', () => {
    expect(() => unwrap({ response: { status: 204 } as Response })).toThrow(
      'finance API returned no data'
    );
  });
});

describe('isUnavailableError', () => {
  it('does not classify an oversized request as the service being unavailable', () => {
    // 413 is the caller's problem and is retryable only after changing the
    // request — it must not be presented as an outage.
    expect(isUnavailableError(new FinanceApiError('too large', 413))).toBe(false);
  });

  it.each([500, 502, 503, 504])('classifies %i as unavailable', (status) => {
    expect(isUnavailableError(new FinanceApiError('x', status))).toBe(true);
  });

  it('classifies a no-status failure as unavailable', () => {
    expect(isUnavailableError(new FinanceApiError('x', undefined))).toBe(true);
  });
});
