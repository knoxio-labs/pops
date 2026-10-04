import { describe, expect, it } from 'vitest';

import { SharedTagListWireSchema } from '../wire.js';

const tag = {
  id: '00000000-0000-4000-8000-000000000001',
  facet: 'trip',
  name: 'Japan trip',
  archived: false,
  mergedIntoId: null,
};

describe('SharedTagListWireSchema', () => {
  it('accepts the fields Purchases caches and ignores producer fields it does not use', () => {
    expect(
      SharedTagListWireSchema.parse({
        tags: [{ ...tag, parentId: null, updatedAt: '2026-10-03T00:00:00.000Z' }],
      })
    ).toEqual({ tags: [tag] });
  });

  it('rejects a malformed entry before a caller can replace the cache', () => {
    expect(
      SharedTagListWireSchema.safeParse({ tags: [{ ...tag, archived: 'false' }] }).success
    ).toBe(false);
  });

  it('rejects duplicate ids in one supposedly complete vocabulary', () => {
    expect(SharedTagListWireSchema.safeParse({ tags: [tag, tag] }).success).toBe(false);
  });
});
