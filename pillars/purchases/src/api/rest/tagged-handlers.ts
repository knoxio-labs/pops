/** Handlers for the `tagged.*` shared-tag carrier routes. */
import {
  attachSharedTag,
  detachSharedTag,
  hasSharedTagId,
  listItemsBySharedTagIds,
  listSharedTagIdsForItem,
  PurchaseItemNotFoundForSharedTagError,
  UnknownSharedTagIdError,
} from '../../db/index.js';
import { purchaseErrorBody } from '../errors.js';

import type { TaggedQueryRequest } from '@pops/types';

import type { PurchasesDb } from '../../db/index.js';

type TagParams = {
  entityType: 'purchase-item';
  entityId: string;
  tagId: string;
};

function itemNotFound(itemId: string) {
  return {
    status: 404 as const,
    body: purchaseErrorBody('not_found', {
      message: `Purchase item '${itemId}' was not found`,
    }),
  };
}

function unknownTag(tagId: string) {
  return {
    status: 400 as const,
    body: purchaseErrorBody('unknown_shared_tag', {
      message: `Shared tag id '${tagId}' is not in the Purchases vocabulary cache`,
    }),
  };
}

export function makeTaggedHandlers(db: PurchasesDb) {
  return {
    list: async ({ body }: { body: TaggedQueryRequest }) => {
      const page = listItemsBySharedTagIds(db, {
        tagIds: body.tagIds,
        ...(body.cursor === undefined ? {} : { cursor: body.cursor }),
        limit: body.limit,
      });
      if (page === null) {
        return { status: 400 as const, body: purchaseErrorBody('invalid_cursor') };
      }

      return {
        status: 200 as const,
        body: {
          items: page.rows.map(({ item, orderedAt, tagIds }) => ({
            uri: `pops://purchases/purchase-item/${item.id}`,
            entityType: 'purchase-item' as const,
            title: item.name,
            tagIds: [...tagIds],
            date: orderedAt,
            amountCents: item.lineTotalCents,
          })),
          nextCursor: page.nextCursor,
        },
      };
    },

    attach: async ({ params }: { params: TagParams }) => {
      if (listSharedTagIdsForItem(db, params.entityId) === null) {
        return itemNotFound(params.entityId);
      }

      try {
        attachSharedTag(db, params.entityId, params.tagId);
      } catch (error) {
        if (error instanceof UnknownSharedTagIdError) return unknownTag(error.tagId);
        if (error instanceof PurchaseItemNotFoundForSharedTagError) {
          return itemNotFound(error.itemId);
        }
        throw error;
      }

      const tagIds = listSharedTagIdsForItem(db, params.entityId);
      if (tagIds === null) return itemNotFound(params.entityId);
      return { status: 200 as const, body: { tagIds } };
    },

    detach: async ({ params }: { params: TagParams }) => {
      const currentTagIds = listSharedTagIdsForItem(db, params.entityId);
      if (currentTagIds === null) return itemNotFound(params.entityId);
      if (!hasSharedTagId(db, params.tagId)) return unknownTag(params.tagId);

      detachSharedTag(db, params.entityId, params.tagId);
      const tagIds = listSharedTagIdsForItem(db, params.entityId);
      if (tagIds === null) return itemNotFound(params.entityId);
      return { status: 200 as const, body: { tagIds } };
    },
  };
}
