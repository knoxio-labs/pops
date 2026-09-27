import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@pops/pillar-sdk/client';

import { InventoryApiError, unwrap } from './inventory-api-helpers';

const reportResponseMock = vi.hoisted(() => vi.fn());

vi.mock('./foundation/interruptions/interruption-store.js', () => ({
  reportResponse: reportResponseMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('unwrap', () => {
  it('reports the response on success and before throwing', () => {
    const successResponse = { status: 200, url: '/inventory-api/type-catalogue' };
    const failureResponse = { status: 401, url: '/inventory-api/type-catalogue' };

    expect(unwrap({ data: { ok: true }, response: successResponse })).toEqual({ ok: true });
    expect(reportResponseMock).toHaveBeenNthCalledWith(1, successResponse);

    expect(() => unwrap({ error: { message: 'failed' }, response: failureResponse })).toThrow(
      InventoryApiError
    );
    expect(reportResponseMock).toHaveBeenNthCalledWith(2, failureResponse);
  });

  it('preserves structured catalogue validation details', () => {
    const response = new Response(null, { status: 400 });

    expect(() =>
      unwrap({
        error: {
          code: 'catalogue_validation_failed',
          message: 'Catalogue validation failed',
          issues: [
            {
              code: 'duplicate_key',
              definitionId: 'field-1',
              message: 'Field key duplicates field-2',
              path: 'key',
            },
          ],
        },
        response,
      })
    ).toThrowError(
      expect.objectContaining<Partial<InventoryApiError>>({
        code: 'catalogue_validation_failed',
        issues: [
          {
            code: 'duplicate_key',
            definitionId: 'field-1',
            message: 'Field key duplicates field-2',
            path: 'key',
          },
        ],
        status: 400,
      })
    );
  });

  it('drops malformed issue entries', () => {
    try {
      unwrap({ error: { message: 'failed', issues: [{ path: 'key' }] } });
    } catch (error) {
      expect(error).toBeInstanceOf(InventoryApiError);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as InventoryApiError).issues).toEqual([]);
      return;
    }
    throw new Error('unwrap did not throw');
  });

  it('keeps inventory issues in ApiError.details while exposing the compatibility view', () => {
    try {
      unwrap({
        error: {
          code: 'inventory.catalogue.invalid',
          details: {
            issues: [
              {
                code: 'duplicate_key',
                definitionId: null,
                message: 'Duplicate key',
                path: 'key',
              },
            ],
          },
          message: 'Catalogue validation failed',
          requestId: '01K123',
          retryable: false,
        },
        response: new Response(null, { status: 400 }),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      if (!(error instanceof ApiError)) throw error;
      expect(error.details).toEqual({
        issues: [
          {
            code: 'duplicate_key',
            definitionId: null,
            message: 'Duplicate key',
            path: 'key',
          },
        ],
      });
      expect(error.issues).toHaveLength(1);
      return;
    }
    throw new Error('unwrap did not throw');
  });
});
