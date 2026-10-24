import { describe, expect, it } from 'vitest';

import { contactRequest, unwrapResponse } from './request';
import { StaleReviewError } from './review/contracts';

describe('safe contact request failures', () => {
  it('preserves revision conflicts as a distinct non-retriable decision error', () => {
    expect(() => unwrapResponse({ response: new Response(null, { status: 409 }) })).toThrow(
      StaleReviewError
    );
  });
  it('reports HTTP status and safe correlation without revealing response data', () => {
    expect(() =>
      unwrapResponse({
        data: { private: 'secret export content' },
        response: new Response(null, {
          status: 403,
          headers: { 'x-request-id': '6de6fe04-9bcd-47b2-ad20-f155edc9d683' },
        }),
      })
    ).toThrow('contacts.http.403 · 6de6fe04-9bcd-47b2-ad20-f155edc9d683');
  });
  it('sanitizes network errors and accepts successful typed data', async () => {
    await expect(
      contactRequest(() => Promise.reject(new Error('credential in a raw URL')))
    ).rejects.toThrow('contacts.network');
    expect(
      unwrapResponse({ data: { count: 3 }, response: new Response(null, { status: 200 }) })
    ).toEqual({ count: 3 });
  });
  it('distinguishes missing transport and incomplete successful responses', () => {
    expect(() => unwrapResponse({})).toThrow('contacts.network');
    expect(() => unwrapResponse({ response: new Response(null, { status: 200 }) })).toThrow(
      'contacts.response.invalid'
    );
  });
});
