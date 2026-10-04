import { describe, expect, it } from 'vitest';

import { CatalogueErrorBodySchema } from '../rest-catalogue-schemas.js';

const errorBody = {
  code: 'inventory.catalogue.draft_conflict',
  message: 'The draft changed before the write completed.',
  requestId: 'req_123',
  retryable: false,
};

describe('catalogue error envelope', () => {
  it('accepts a positive integer current draft version inside details', () => {
    const result = CatalogueErrorBodySchema.safeParse({
      ...errorBody,
      details: { currentDraftVersion: 1 },
    });

    expect(result.success).toBe(true);
  });

  it.each([0, 1.5, '2'])('rejects an invalid current draft version: %s', (version) => {
    const result = CatalogueErrorBodySchema.safeParse({
      ...errorBody,
      details: { currentDraftVersion: version },
    });

    expect(result.success).toBe(false);
  });

  it('preserves other detail fields on shared catalogue errors', () => {
    const details = { currentDraftVersion: 2, extra: { reason: 'retry later' } };

    expect(CatalogueErrorBodySchema.parse({ ...errorBody, details }).details).toEqual(details);
  });
});
