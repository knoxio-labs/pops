import { describe, expect, it } from 'vitest';

import { BfmApiError, isUnavailableError, unwrap } from '../bfm-api-helpers';

function responseWith(status: number): Response {
  return new Response(null, { status });
}

describe('unwrap', () => {
  it('returns the data payload when the call succeeded', () => {
    expect(unwrap({ data: { ok: true } })).toEqual({ ok: true });
  });

  it('returns falsy data verbatim rather than treating it as absent', () => {
    expect(unwrap({ data: 0 })).toBe(0);
    expect(unwrap({ data: '' })).toBe('');
    expect(unwrap({ data: false })).toBe(false);
  });

  it('throws BfmApiError carrying the server message', () => {
    expect(() =>
      unwrap({ error: { message: 'pairing code expired' }, response: responseWith(410) })
    ).toThrow(new BfmApiError('pairing code expired', 410));
  });

  it('attaches the HTTP status to the thrown error', () => {
    try {
      unwrap({ error: { message: 'boom' }, response: responseWith(503) });
      expect.unreachable('unwrap should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BfmApiError);
      expect((err as BfmApiError).status).toBe(503);
    }
  });

  it('falls back to a generic message when the body carries none', () => {
    expect(() => unwrap({ error: {}, response: responseWith(500) })).toThrow(
      'bfm API request failed'
    );
  });

  it('falls back when the body message is an empty string or not a string', () => {
    expect(() => unwrap({ error: { message: '' } })).toThrow('bfm API request failed');
    expect(() => unwrap({ error: { message: 42 } })).toThrow('bfm API request failed');
  });

  it('throws when the call reported neither data nor error', () => {
    expect(() => unwrap({})).toThrow('bfm API returned no data');
  });

  it('leaves status undefined when no response accompanied the failure', () => {
    try {
      unwrap({ error: { message: 'network down' } });
      expect.unreachable('unwrap should have thrown');
    } catch (err) {
      expect((err as BfmApiError).status).toBeUndefined();
    }
  });
});

describe('isUnavailableError', () => {
  it('is true for a transport failure that carried no status', () => {
    expect(isUnavailableError(new BfmApiError('network down', undefined))).toBe(true);
  });

  it.each([500, 502, 503, 504, 599])('is true for %i', (status) => {
    expect(isUnavailableError(new BfmApiError('down', status))).toBe(true);
  });

  // The whole point of the classification: a pillar that ANSWERED is not
  // "unavailable", however unhappy the answer. Collapsing 4xx into
  // unavailable would render "bfm is down" for an expired pairing code.
  it.each([400, 401, 403, 404, 409, 410, 422, 429, 499])('is false for %i', (status) => {
    expect(isUnavailableError(new BfmApiError('refused', status))).toBe(false);
  });

  it('is false for errors that did not come from this SDK', () => {
    expect(isUnavailableError(new Error('unrelated'))).toBe(false);
    expect(isUnavailableError(undefined)).toBe(false);
    expect(isUnavailableError(null)).toBe(false);
    expect(isUnavailableError({ status: 503 })).toBe(false);
  });
});
