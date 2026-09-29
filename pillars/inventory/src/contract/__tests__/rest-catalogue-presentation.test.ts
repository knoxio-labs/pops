import { describe, expect, it } from 'vitest';

import { CataloguePutFieldSchema, CataloguePutTypeSchema } from '../rest-catalogue-schemas.js';

describe('catalogue type presentation', () => {
  it('accepts semantic icon tokens and other presentation hints', () => {
    expect(
      CataloguePutTypeSchema.safeParse({
        kind: 'put_type',
        key: 'book',
        label: 'Book',
        presentation: { icon: 'book', density: 'compact' },
      }).success
    ).toBe(true);
  });

  it('rejects an unknown type icon token', () => {
    expect(
      CataloguePutTypeSchema.safeParse({
        kind: 'put_type',
        key: 'book',
        label: 'Book',
        presentation: { icon: 'ios-book-symbol' },
      }).success
    ).toBe(false);
  });

  it('keeps field presentation open-ended', () => {
    expect(
      CataloguePutFieldSchema.safeParse({
        kind: 'put_field',
        typeId: '00000000-0000-4000-8000-000000000001',
        presentation: { decimalPlaces: 2, icon: 'domain-specific' },
      }).success
    ).toBe(true);
  });
});
