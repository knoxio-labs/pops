import { describe, expect, it } from 'vitest';

import { ContactsApiError, isUnavailableError, unwrap } from './contacts-api-helpers';

function failure(status: number | undefined): unknown {
  try {
    unwrap({
      error: { message: 'x' },
      response: status === undefined ? undefined : new Response(null, { status }),
    });
  } catch (err) {
    return err;
  }
  throw new Error('unwrap did not throw');
}

describe('isUnavailableError', () => {
  it.each([500, 502, 503, 504])('is true for a %i from contacts', (status) => {
    expect(isUnavailableError(failure(status))).toBe(true);
  });

  it('is true when contacts never answered', () => {
    expect(isUnavailableError(failure(undefined))).toBe(true);
  });

  it.each([400, 404, 409, 499])('is false for a %i, which is contacts answering', (status) => {
    expect(isUnavailableError(failure(status))).toBe(false);
  });

  it('is false for anything that is not a contacts failure', () => {
    expect(isUnavailableError(new Error('network down'))).toBe(false);
    expect(isUnavailableError(undefined)).toBe(false);
    expect(isUnavailableError(new ContactsApiError('x', 404))).toBe(false);
  });
});
