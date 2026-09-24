import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { EXPRESSION_VERSIONS } from '../../catalogue/expression-parser.js';
import { CatalogueExpressionVersionSchema } from '../rest-catalogue-expression-schema.js';
import { CataloguePutFieldSchema } from '../rest-catalogue-schemas.js';

function putField(expressionVersion: unknown) {
  return CataloguePutFieldSchema.safeParse({
    kind: 'put_field',
    typeId: randomUUID(),
    expressionVersion,
  });
}

describe('put_field expressionVersion', () => {
  it('accepts exactly the versions the server stores', () => {
    for (const version of EXPRESSION_VERSIONS)
      expect(CatalogueExpressionVersionSchema.safeParse(version).success).toBe(true);
    expect([...CatalogueExpressionVersionSchema.values]).toEqual(EXPRESSION_VERSIONS);
  });

  it('accepts 1, 2, null and an absent version', () => {
    for (const version of [1, 2, null, undefined]) expect(putField(version).success).toBe(true);
  });

  it('rejects a version the server does not store', () => {
    for (const version of [0, 3, 1.5, '2']) expect(putField(version).success).toBe(false);
  });

  it('describes what each version means', () => {
    expect(CatalogueExpressionVersionSchema.description).toMatch(/compares decimals by value/u);
  });
});
