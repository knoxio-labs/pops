/** Finance's authenticated client for the shared tags vocabulary. */
import {
  isOk,
  pillar,
  type CallFailure,
  type CallResult,
  type PillarHandle,
} from '@pops/pillar-sdk/server';

import { credentialled, NO_CREDENTIAL_REASON } from '../pillars/outbound.js';
import { SharedTagSchema, TagsListResponseSchema } from './wire.js';

import type { CreateSharedTagInput, SharedTag, TagsListQuery, TagsListResponse } from './wire.js';

/** The subset of the tags contract this Finance client calls. */
export type TagsRouter = {
  tags: {
    list: (input: TagsListQuery) => Promise<TagsListResponse>;
    create: (input: CreateSharedTagInput) => Promise<SharedTag>;
  };
};

/** A missing key is local configuration, not an empty vocabulary or outage. */
export type TagsClientResult<T> =
  | CallResult<T>
  | { kind: 'no-credential'; reason: typeof NO_CREDENTIAL_REASON };

export interface TagsClient {
  list(input?: TagsListQuery): Promise<TagsClientResult<SharedTag[]>>;
  create(input: CreateSharedTagInput): Promise<TagsClientResult<SharedTag>>;
}

function malformedResponse(operation: 'tags.list' | 'tags.create'): CallFailure {
  return {
    kind: 'contract-mismatch',
    pillar: 'tags',
    expected: operation,
    actual: 'malformed response body',
  };
}

/**
 * Build the default authenticated tags client. The handle factory is an
 * injectable seam for tests; production constructs the server SDK handle per
 * operation so a missing service-account key becomes a visible result rather
 * than preventing Finance from booting.
 */
export function createTagsClient(
  handleFactory: () => PillarHandle<TagsRouter> | null = () =>
    credentialled('tags', () => pillar<TagsRouter>('tags'))
): TagsClient {
  return {
    async list(input = {}): Promise<TagsClientResult<SharedTag[]>> {
      const handle = handleFactory();
      if (handle === null) return { kind: 'no-credential', reason: NO_CREDENTIAL_REASON };

      const response = await handle.tags.list(input);
      if (!isOk(response)) return response;

      const parsed = TagsListResponseSchema.safeParse(response.value);
      if (!parsed.success) return malformedResponse('tags.list');
      return { kind: 'ok', value: parsed.data.tags };
    },

    async create(input): Promise<TagsClientResult<SharedTag>> {
      const handle = handleFactory();
      if (handle === null) return { kind: 'no-credential', reason: NO_CREDENTIAL_REASON };

      const response = await handle.tags.create(input);
      if (!isOk(response)) return response;

      const parsed = SharedTagSchema.safeParse(response.value);
      if (!parsed.success) return malformedResponse('tags.create');
      return { kind: 'ok', value: parsed.data };
    },
  };
}
