import { describe, expect, it } from 'vitest';

import {
  TagAssignmentResponseSchema,
  TaggedQueryRequestSchema,
  TaggedQueryResponseSchema,
} from '@pops/types';

import { financeTaggedContract } from '../rest-tagged.js';

describe('financeTaggedContract', () => {
  it('uses the fixed paths and methods for all tagged operations', () => {
    expect(financeTaggedContract.list).toMatchObject({
      method: 'POST',
      path: '/tagged/query',
    });
    expect(financeTaggedContract.attach).toMatchObject({
      method: 'PUT',
      path: '/tagged/:entityType/:entityId/tags/:tagId',
    });
    expect(financeTaggedContract.detach).toMatchObject({
      method: 'DELETE',
      path: '/tagged/:entityType/:entityId/tags/:tagId',
    });
  });

  it('uses the shared tagged query and assignment schemas', () => {
    expect(financeTaggedContract.list.body).toBe(TaggedQueryRequestSchema);
    expect(financeTaggedContract.list.responses[200]).toBe(TaggedQueryResponseSchema);
    expect(financeTaggedContract.attach.responses[200]).toBe(TagAssignmentResponseSchema);
    expect(financeTaggedContract.detach.responses[200]).toBe(TagAssignmentResponseSchema);
  });

  it('only accepts transaction entity types in the path', () => {
    const { pathParams } = financeTaggedContract.attach;

    expect(
      pathParams.safeParse({ entityType: 'transaction', entityId: 'txn-1', tagId: 'trip-1' })
        .success
    ).toBe(true);
    expect(
      pathParams.safeParse({ entityType: 'purchase-item', entityId: 'item-1', tagId: 'trip-1' })
        .success
    ).toBe(false);
  });
});
