import { describe, expect, it } from 'vitest';

import { InventoryApiError, unwrap } from './inventory-api-helpers';

describe('unwrap', () => {
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
      expect((error as InventoryApiError).issues).toEqual([]);
      return;
    }
    throw new Error('unwrap did not throw');
  });
});
