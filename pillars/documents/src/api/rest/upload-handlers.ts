import { uploadErrors } from '../uploads/errors.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { documentsContract } from '../../contract/rest.js';
import type { DurableUploads } from '../uploads/service.js';

type Read = ServerInferRequest<typeof documentsContract>['paperless']['upload'];
type Write = ServerInferRequest<typeof documentsContract>['write'];

/** Resolve a configured producer; app factories may omit it only when testing unrelated legacy routes. */
export function requireDurableUploads(value: DurableUploads | undefined): DurableUploads {
  return value ?? uploadErrors.storage();
}

/** JSON upload handlers share the same producer as the sanctioned raw PUT. */
export function makeUploadHandlers(value: DurableUploads | undefined) {
  return {
    upload: async ({ params }: Read) => ({
      status: 200 as const,
      body: { data: await requireDurableUploads(value).get(params.operationId) },
    }),
    createUpload: async ({ body }: Write['createUpload']) => ({
      status: 200 as const,
      body: { data: requireDurableUploads(value).create(body) },
    }),
    dispatchUpload: async ({ params }: Write['dispatchUpload']) => ({
      status: 200 as const,
      body: { data: await requireDurableUploads(value).dispatch(params.operationId) },
    }),
  };
}
