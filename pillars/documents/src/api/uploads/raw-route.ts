import { UploadParamsSchema } from '../../contract/upload-schemas.js';
import { mimeEssence } from '../modules/paperless/upload-limits.js';
import { uploadErrors } from './errors.js';

import type { Request, Response } from 'express';

import type { DurableUploads } from './service.js';

/** Raw operation write.uploadContent, projected by the same live scope map as the other byte routes. */
export const UPLOAD_CONTENT_ROUTE_PATH = '/paperless/uploads/:operationId/content';

async function* requestBytes(req: Request): AsyncGenerator<Uint8Array> {
  for await (const chunk of req) {
    if (!(chunk instanceof Uint8Array)) uploadErrors.invalid();
    yield chunk;
  }
}

/** Stream bytes directly into the private spool, never through JSON/base64 or a caller-supplied path. */
export function uploadContentHandler(uploads: DurableUploads) {
  return async (req: Request, res: Response): Promise<void> => {
    const params = UploadParamsSchema.safeParse(req.params);
    if (!params.success) return uploadErrors.invalid();
    const mimeType = mimeEssence(req.get('content-type'));
    if (mimeType === null) return uploadErrors.invalid();
    const data = await uploads.content(params.data.operationId, mimeType, requestBytes(req));
    res.setHeader('Connection', 'close');
    res.status(200).json({ data });
  };
}
