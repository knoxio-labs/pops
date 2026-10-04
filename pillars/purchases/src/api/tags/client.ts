/**
 * Read the shared tag vocabulary into Purchases' local cache.
 *
 * This is an outbound server call, so it uses the authenticated SDK surface
 * and a narrow router type declared beside the call. The response is
 * validated locally because the router type only describes what the proxy
 * sends; it does not validate what the tags pillar returned.
 */
import { isOk, pillar, type CallResult, type PillarHandle } from '@pops/pillar-sdk/server';

import {
  credentialled,
  credentialRejectedMessage,
  UNAUTHORIZED_REASON,
} from '../pillars/outbound.js';
import { SharedTagListWireSchema, type SharedTagWire } from './wire.js';

/** Registry id of the pillar that owns the shared vocabulary. */
export const TAGS_PILLAR_ID = 'tags';

/** Only the list operation Purchases consumes from the tags router. */
export type TagsRouter = {
  tags: {
    list: (input: { includeArchived: 'true' }) => Promise<CallResult<unknown>>;
  };
};

/** A complete vocabulary fetch or a reason the current cache must be kept. */
export type SharedTagFetch =
  | { readonly kind: 'ok'; readonly tags: readonly SharedTagWire[] }
  | { readonly kind: 'unavailable'; readonly reason: string }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'no-credential' };

export interface TagsClient {
  fetchAll(): Promise<SharedTagFetch>;
}

export type TagsHandleFactory = () => PillarHandle<TagsRouter> | null;

/** Create a read client whose failures never look like an empty vocabulary. */
export function createTagsClient(
  handleFactory: TagsHandleFactory = () =>
    credentialled(TAGS_PILLAR_ID, () => pillar<TagsRouter>(TAGS_PILLAR_ID))
): TagsClient {
  return {
    async fetchAll(): Promise<SharedTagFetch> {
      const handle = handleFactory();
      if (handle === null) return { kind: 'no-credential' };

      let result: CallResult<unknown>;
      try {
        result = await handle.tags.list({ includeArchived: 'true' });
      } catch {
        return { kind: 'unavailable', reason: 'request-failed' };
      }

      if (!isOk(result)) {
        if (result.kind === UNAUTHORIZED_REASON) {
          console.error(credentialRejectedMessage(TAGS_PILLAR_ID, 'tags.list'));
          return { kind: 'unauthorized' };
        }
        return { kind: 'unavailable', reason: result.kind };
      }

      const parsed = SharedTagListWireSchema.safeParse(result.value);
      if (!parsed.success) {
        console.warn(
          '[purchases-api] tags.tags.list returned an unreadable response; keeping the current cache: ' +
            parsed.error.message
        );
        return { kind: 'unavailable', reason: 'contract-mismatch' };
      }

      return { kind: 'ok', tags: parsed.data.tags };
    },
  };
}
