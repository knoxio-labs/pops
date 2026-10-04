import { ok } from '../respond';

import type { MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

import type {
  TaggedAttachResponses,
  TaggedDetachResponses,
  TaggedListResponses,
} from '../../../finance-api/types.gen';

const EMPTY_LIST: TaggedListResponses[200] = { items: [], nextCursor: null };
const EMPTY_TAGS: TaggedAttachResponses[200] = { tagIds: [] };
const DETACHED_TAGS: TaggedDetachResponses[200] = { tagIds: [] };

/** Standalone tagged-transaction operations have no persisted mock state. */
export const taggedHandlers: MockHandlers = {
  'POST /tagged/query': ok(EMPTY_LIST),
  'PUT /tagged/{entityType}/{entityId}/tags/{tagId}': ok(EMPTY_TAGS),
  'DELETE /tagged/{entityType}/{entityId}/tags/{tagId}': ok(DETACHED_TAGS),
};
