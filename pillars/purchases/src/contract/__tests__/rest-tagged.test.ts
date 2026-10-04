import { describe, expect, it } from 'vitest';

import {
  TagAssignmentResponseSchema,
  TaggedQueryRequestSchema,
  TaggedQueryResponseSchema,
} from '@pops/types';

import { ErrorBodySchema } from '../rest-schemas.js';
import { purchasesTaggedContract } from '../rest-tagged.js';

describe('purchasesTaggedContract', () => {
  it('uses the fixed paths and methods for all tagged operations', () => {
    expect(purchasesTaggedContract.list).toMatchObject({
      method: 'POST',
      path: '/tagged/query',
    });
    expect(purchasesTaggedContract.attach).toMatchObject({
      method: 'PUT',
      path: '/tagged/:entityType/:entityId/tags/:tagId',
    });
    expect(purchasesTaggedContract.detach).toMatchObject({
      method: 'DELETE',
      path: '/tagged/:entityType/:entityId/tags/:tagId',
    });
  });

  it('uses the shared tagged query and assignment schemas', () => {
    expect(purchasesTaggedContract.list.body).toBe(TaggedQueryRequestSchema);
    expect(purchasesTaggedContract.list.responses[200]).toBe(TaggedQueryResponseSchema);
    expect(purchasesTaggedContract.attach.responses[200]).toBe(TagAssignmentResponseSchema);
    expect(purchasesTaggedContract.detach.responses[200]).toBe(TagAssignmentResponseSchema);
  });

  it('declares validation errors for every request-validated route', () => {
    expect(purchasesTaggedContract.list.responses[400]).toBe(ErrorBodySchema);
    expect(purchasesTaggedContract.attach.responses[400]).toBe(ErrorBodySchema);
    expect(purchasesTaggedContract.detach.responses[400]).toBe(ErrorBodySchema);
  });

  it('only accepts purchase-item entity types in the path', () => {
    const { pathParams } = purchasesTaggedContract.attach;

    expect(
      pathParams.safeParse({ entityType: 'purchase-item', entityId: 'item-1', tagId: 'trip-1' })
        .success
    ).toBe(true);
    expect(
      pathParams.safeParse({ entityType: 'transaction', entityId: 'txn-1', tagId: 'trip-1' })
        .success
    ).toBe(false);
  });
});
