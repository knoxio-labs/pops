import { z } from 'zod';

/**
 * `POST /paperless/documents` — the request body is the file, streamed
 * straight through to Paperless's `post_document`; nothing is buffered
 * beyond the chunk in flight. Metadata travels in the query (`fileName`,
 * optional `title`) and the MIME type in `Content-Type`.
 *
 * The cap is enforced twice: a declared `Content-Length` over it is refused
 * before a byte is read, and a body without one (chunked) is counted while it
 * streams and abandoned the moment it passes the cap.
 */
import { defineErrors } from '@pops/pillar-express';

import { PaperlessApiError } from '../modules/paperless/types.js';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  isAllowedUploadMimeType,
  mimeEssence,
  resolveMaxUploadBytes,
} from '../modules/paperless/upload-limits.js';
import { requirePaperlessClient, throwPaperlessFailure } from '../paperless-errors.js';

import type { Request, Response } from 'express';

/** The Express path the upload route registers, as the scope gate declares it. */
export const UPLOAD_ROUTE_PATH = '/paperless/documents';

const uploadErrors = defineErrors('documents', {
  invalid: {
    area: 'upload',
    status: 400,
    message: 'The upload request is invalid.',
    retryable: false,
  },
  too_large: {
    area: 'upload',
    status: 413,
    message: 'The file is larger than the upload limit.',
    retryable: false,
  },
  unsupported_type: {
    area: 'upload',
    status: 415,
    message: 'This file type cannot be uploaded.',
    retryable: false,
  },
  rejected: {
    area: 'upload',
    status: 422,
    message: 'Paperless-ngx rejected the file.',
    retryable: false,
  },
});

const NO_CONTROL_CHARACTERS = /^[^\p{Cc}]+$/u;

const UploadQuerySchema = z.object({
  fileName: z.string().min(1).max(255).regex(NO_CONTROL_CHARACTERS),
  title: z.string().min(1).max(128).regex(NO_CONTROL_CHARACTERS).optional(),
});

/** Counts what passes through and fails the stream the moment the total exceeds the cap. */
class CappedBody {
  exceeded = false;

  constructor(
    private readonly source: Request,
    private readonly limitBytes: number
  ) {}

  async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
    let total = 0;
    for await (const chunk of this.source) {
      if (!(chunk instanceof Uint8Array)) throw new TypeError('Request body chunk is not bytes');
      total += chunk.length;
      if (total > this.limitBytes) {
        this.exceeded = true;
        throw new RangeError(`Upload exceeded ${this.limitBytes} bytes`);
      }
      yield chunk;
    }
  }
}

function refuseTooLarge(res: Response, limitBytes: number): never {
  // The unread remainder of the body is never consumed; closing the
  // connection after the 413 stops the client from streaming it at a socket
  // nobody reads.
  res.setHeader('Connection', 'close');
  return uploadErrors.too_large({ maxUploadBytes: limitBytes });
}

function declaredLength(req: Request): number | null {
  const raw = req.get('content-length');
  return raw === undefined ? null : Number(raw);
}

interface ValidUpload {
  readonly query: z.infer<typeof UploadQuerySchema>;
  readonly mimeType: string;
  readonly limit: number;
}

function validated(req: Request, res: Response): ValidUpload {
  const query = UploadQuerySchema.safeParse(req.query);
  if (!query.success) return uploadErrors.invalid({ issues: query.error.issues });
  const mimeType = mimeEssence(req.get('content-type'));
  if (mimeType === null || !isAllowedUploadMimeType(mimeType)) {
    return uploadErrors.unsupported_type({ allowedMimeTypes: ALLOWED_UPLOAD_MIME_TYPES });
  }
  const limit = resolveMaxUploadBytes();
  const length = declaredLength(req);
  if (length !== null && length > limit) return refuseTooLarge(res, limit);
  return { query: query.data, mimeType, limit };
}

/** Handle one upload request, answering `202 { data: { taskId } }`. */
export async function handleUpload(req: Request, res: Response): Promise<void> {
  const { query, mimeType, limit } = validated(req, res);
  const client = requirePaperlessClient();
  const body = new CappedBody(req, limit);
  let taskId: string;
  try {
    taskId = await client.postDocument(body, { ...query, mimeType });
  } catch (err) {
    if (body.exceeded) return refuseTooLarge(res, limit);
    if (err instanceof PaperlessApiError && err.status === 400) return uploadErrors.rejected();
    return throwPaperlessFailure(err);
  }
  res.status(202).json({ data: { taskId } });
}
