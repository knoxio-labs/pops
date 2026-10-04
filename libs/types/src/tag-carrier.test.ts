import { describe, expect, it } from 'vitest';

import {
  TAGGED_ATTACH_OPERATION_ID,
  TAGGED_DETACH_OPERATION_ID,
  TAGGED_LIST_OPERATION_ID,
  TagCarrierManifestSchema,
  TaggedQueryRequestSchema,
} from './tag-carrier.js';

describe('TagCarrierManifestSchema', () => {
  it('requires at least one carrier', () => {
    expect(TagCarrierManifestSchema.safeParse({ carriers: [] }).success).toBe(false);
  });

  it('rejects an entity type that is not kebab-case', () => {
    expect(
      TagCarrierManifestSchema.safeParse({ carriers: [{ entityType: 'purchaseItem' }] }).success
    ).toBe(false);
  });

  it('rejects unknown fields inside the carrier declaration', () => {
    expect(
      TagCarrierManifestSchema.safeParse({
        carriers: [{ entityType: 'purchase-item', extra: true }],
      }).success
    ).toBe(false);
  });
});

describe('TaggedQueryRequestSchema', () => {
  it('rejects an empty tag id list', () => {
    expect(TaggedQueryRequestSchema.safeParse({ tagIds: [] }).success).toBe(false);
  });

  it('rejects more than 500 tag ids', () => {
    const tagIds = Array.from({ length: 501 }, (_, index) => `tag-${index}`);
    expect(TaggedQueryRequestSchema.safeParse({ tagIds }).success).toBe(false);
  });

  it('defaults the limit and accepts its inclusive boundaries', () => {
    expect(TaggedQueryRequestSchema.parse({ tagIds: ['tag-a'] }).limit).toBe(200);
    expect(TaggedQueryRequestSchema.safeParse({ tagIds: ['tag-a'], limit: 1 }).success).toBe(true);
    expect(TaggedQueryRequestSchema.safeParse({ tagIds: ['tag-a'], limit: 500 }).success).toBe(
      true
    );
    expect(TaggedQueryRequestSchema.safeParse({ tagIds: ['tag-a'], limit: 501 }).success).toBe(
      false
    );
  });

  it('uses the tagged operation suffixes independently of vocabulary operations', () => {
    expect(TAGGED_LIST_OPERATION_ID).toBe('tagged.list');
    expect(TAGGED_ATTACH_OPERATION_ID).toBe('tagged.attach');
    expect(TAGGED_DETACH_OPERATION_ID).toBe('tagged.detach');
  });
});
