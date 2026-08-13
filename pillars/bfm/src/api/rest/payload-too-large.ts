/**
 * The body parser's refusal, reshaped for the phone.
 *
 * `express.json` rejects an oversized body before any route matches, by
 * throwing an error the default handler renders as an HTML page with a `413`.
 * On this surface that is worse than useless: the iOS client is generated from
 * the contract, so a response whose body is not the declared shape is one it
 * decodes as a failure of the app rather than a refusal it can explain — and
 * the whole reason bfm caps the body itself (ADR-046) is to answer this in
 * terms the caller can act on rather than forwarding it and letting the pillar
 * behind decide.
 *
 * Only `/mobile` is reshaped. The operator and device surfaces declare no 413
 * and are not reached by a generated client, so quietly changing what they
 * answer is not this handler's business.
 */
import { MOBILE_UPLOAD_MAX_BYTES } from '../../contract/rest-schemas.js';
import { MOBILE_PATH_PREFIX } from '../paths.js';

import type { NextFunction, Response } from 'express';

import type { MobilePayloadTooLargeError } from '../../contract/rest-schemas.js';

/** All this handler reads off the request. */
type PathOnlyRequest = { readonly path: string };

/**
 * body-parser's own discriminant. It sets `type` on the error it throws, and
 * `entity.too.large` is the one that means the body exceeded `limit` — as
 * opposed to `entity.parse.failed`, which is malformed JSON and is a `400`.
 */
const TOO_LARGE_TYPE = 'entity.too.large';

function isPayloadTooLarge(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('type' in error)) return false;
  return error.type === TOO_LARGE_TYPE;
}

function isUnderMobilePrefix(path: string): boolean {
  return path === MOBILE_PATH_PREFIX || path.startsWith(`${MOBILE_PATH_PREFIX}/`);
}

const PAYLOAD_TOO_LARGE: MobilePayloadTooLargeError = {
  code: 'payload_too_large',
  maxBytes: MOBILE_UPLOAD_MAX_BYTES,
  message: 'This upload is larger than the server accepts. Send fewer or smaller parts.',
};

export function createPayloadTooLargeErrorHandler() {
  return (error: unknown, req: PathOnlyRequest, res: Response, next: NextFunction): void => {
    if (!isPayloadTooLarge(error) || !isUnderMobilePrefix(req.path)) {
      next(error);
      return;
    }

    res.status(413).json(PAYLOAD_TOO_LARGE);
  };
}
