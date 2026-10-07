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
import type { SharedTagCacheRefreshOutcome } from '../cron/refresh-shared-tags.js';

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

async function attachWithOneCacheRefresh(
  db: PurchasesDb,
  entityId: string,
  tagId: string,
  refreshSharedTagCache: (() => Promise<SharedTagCacheRefreshOutcome>) | undefined
): Promise<void> {
  try {
    attachSharedTag(db, entityId, tagId);
  } catch (error) {
    if (!(error instanceof UnknownSharedTagIdError) || refreshSharedTagCache === undefined) {
      throw error;
    }
    try {
      await refreshSharedTagCache();
    } catch {
      throw error;
    }
    attachSharedTag(db, entityId, tagId);
  }
}

/** Creates the shared-tag carrier handlers, including one cache refresh for a stale tag assignment. */
export function makeTaggedHandlers(
  db: PurchasesDb,
  refreshSharedTagCache?: () => Promise<SharedTagCacheRefreshOutcome>
) {
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
        await attachWithOneCacheRefresh(db, params.entityId, params.tagId, refreshSharedTagCache);
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
