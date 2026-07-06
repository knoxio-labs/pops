/**
 * Unit tests for `withRateLimitRetry` — the exponential-backoff-on-429 retry
 * shared by both the imports categorizer and the corrections AI cluster.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withRateLimitRetry } from '../ai-retry.js';

function rateLimitError(): Error {
  const err = new Error('Too Many Requests') as Error & { status: number };
  err.status = 429;
  return err;
}

function serverError(status = 503): Error {
  const err = new Error('Service Unavailable') as Error & { status: number };
  err.status = status;
  return err;
}

function networkError(code = 'ECONNREFUSED'): Error {
  const err = new Error(`connect ${code}`) as Error & { code: string };
  err.code = code;
  return err;
}

function fetchFailedWithCause(code = 'ETIMEDOUT'): Error {
  const err = new TypeError('fetch failed');
  Object.defineProperty(err, 'cause', { value: networkError(code) });
  return err;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('withRateLimitRetry', () => {
  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    await expect(withRateLimitRetry(fn, 'ctx')).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and succeeds once the transient limit clears', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError())
      .mockRejectedValueOnce(rateLimitError())
      .mockResolvedValue('ok');

    const promise = withRateLimitRetry(fn, 'ctx');
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-429 error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(withRateLimitRetry(fn, 'ctx')).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('rethrows the 429 once retries are exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(rateLimitError());

    const promise = withRateLimitRetry(fn, 'ctx');
    const assertion = expect(promise).rejects.toMatchObject({ status: 429 });
    await vi.runAllTimersAsync();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(6);
  });

  it('retries on a 5xx and succeeds once the transient failure clears', async () => {
    const fn = vi.fn().mockRejectedValueOnce(serverError(503)).mockResolvedValue('ok');

    const promise = withRateLimitRetry(fn, 'ctx');
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rethrows the 5xx once its smaller retry budget is exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(serverError(500));

    const promise = withRateLimitRetry(fn, 'ctx');
    const assertion = expect(promise).rejects.toMatchObject({ status: 500 });
    await vi.runAllTimersAsync();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries a status-less network error and succeeds once it clears', async () => {
    const fn = vi.fn().mockRejectedValueOnce(networkError('ECONNREFUSED')).mockResolvedValue('ok');

    const promise = withRateLimitRetry(fn, 'ctx');
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries a network error nested under a fetch-failed cause', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(fetchFailedWithCause('ETIMEDOUT'))
      .mockResolvedValue('ok');

    const promise = withRateLimitRetry(fn, 'ctx');
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives a network error the smaller 5xx budget, not the 429 budget', async () => {
    const fn = vi.fn().mockRejectedValue(networkError('ETIMEDOUT'));

    const promise = withRateLimitRetry(fn, 'ctx');
    const assertion = expect(promise).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    await vi.runAllTimersAsync();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(3);
  });
});
