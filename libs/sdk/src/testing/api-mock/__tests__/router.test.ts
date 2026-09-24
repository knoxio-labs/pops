import { describe, expect, it } from 'vitest';

import { matchOperation } from '../router.js';

const KEYS = [
  'GET /products',
  'GET /products/{productId}',
  'PATCH /products/aliases/{aliasId}',
  'PATCH /products/{productId}',
  'GET /products/aliases',
  'GET /entities/{id}/avatar',
];

describe('matchOperation', () => {
  it('binds path parameters by the template’s own names', () => {
    expect(matchOperation('GET', '/products/prd_1', KEYS)).toEqual({
      key: 'GET /products/{productId}',
      params: { productId: 'prd_1' },
    });
  });

  it('prefers the literal template over a parameter that also accepts the path', () => {
    expect(matchOperation('GET', '/products/aliases', KEYS)?.key).toBe('GET /products/aliases');
    expect(matchOperation('PATCH', '/products/aliases', KEYS)?.key).toBe(
      'PATCH /products/{productId}'
    );
  });

  it('is independent of declaration order', () => {
    expect(matchOperation('GET', '/products/aliases', KEYS.toReversed())?.key).toBe(
      'GET /products/aliases'
    );
  });

  it('matches the method in any case and nothing under another method', () => {
    expect(matchOperation('get', '/products', KEYS)?.key).toBe('GET /products');
    expect(matchOperation('DELETE', '/products', KEYS)).toBeUndefined();
  });

  it('decodes an encoded parameter', () => {
    expect(matchOperation('GET', '/entities/a%2Fb/avatar', KEYS)?.params).toEqual({ id: 'a/b' });
  });

  it('refuses an empty segment where a parameter is expected', () => {
    expect(matchOperation('GET', '/products/', KEYS)).toBeUndefined();
    expect(matchOperation('GET', '/entities//avatar', KEYS)).toBeUndefined();
  });

  it('refuses a path of a different depth', () => {
    expect(matchOperation('GET', '/products/prd_1/extra', KEYS)).toBeUndefined();
  });

  it('skips keys that are not `<METHOD> /path`', () => {
    expect(matchOperation('GET', '/products', ['GET products', 'GET', 'GET /products'])?.key).toBe(
      'GET /products'
    );
  });
});
