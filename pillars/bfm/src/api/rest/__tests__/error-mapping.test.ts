import { describe, expect, it } from 'vitest';

import {
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../shared/errors.js';
import { mapHttpError } from '../error-mapping.js';

describe('operator HTTP error mapping', () => {
  it('uses a registered envelope for operator authentication failures', () => {
    expect(mapHttpError(new UnauthorizedError())).toMatchObject({
      status: 401,
      body: {
        code: 'bfm.auth.operator_unauthorized',
        retryable: false,
        requestId: expect.any(String),
      },
    });
  });

  it('uses a registered envelope for a refused guest', () => {
    expect(mapHttpError(new ForbiddenError())).toMatchObject({
      status: 403,
      body: {
        code: 'bfm.auth.operator_forbidden',
        retryable: false,
        requestId: expect.any(String),
      },
    });
  });

  it('does not derive the resource code from the exception class name', () => {
    expect(mapHttpError(new NotFoundError('Device', 'device-1'))).toMatchObject({
      status: 404,
      body: {
        code: 'bfm.resource.not_found',
        retryable: false,
        requestId: expect.any(String),
      },
    });
  });

  it('preserves the retry delay as safe envelope details', () => {
    expect(mapHttpError(new TooManyRequestsError(17))).toMatchObject({
      status: 429,
      body: {
        code: 'bfm.request.rate_limited',
        retryable: true,
        details: { retryAfterSeconds: 17 },
        requestId: expect.any(String),
      },
    });
  });
});
