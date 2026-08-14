/**
 * Turns a body-parser failure into the contract's `ErrorBodySchema` shape.
 *
 * `express.json()` throws (via `next(err)`) rather than returning a response,
 * so with nothing after it Express's own `finalhandler` answers with an HTML
 * error page — a shape no generated Hey API client can parse, which degrades
 * every caller's `error` to a bare unreadable string. Every failure `read()`
 * (in `body-parser`) can produce carries an `http-errors` instance with a
 * numeric `status` and a `type` naming which check failed; this middleware
 * reads both off the error rather than special-casing `PayloadTooLargeError`
 * alone, so a body that fails a different body-parser check answers the same
 * legible way.
 *
 * Mounted directly after `express.json()`, ahead of every other middleware,
 * so it is the first error handler in the stack — anything past this point
 * that calls `next(err)` with an unrelated error falls through unchanged.
 */
import type { ErrorRequestHandler } from 'express';

interface BodyParserFailure extends Error {
  readonly status: number;
  readonly type: string;
}

function isBodyParserFailure(err: unknown): err is BodyParserFailure {
  return (
    err instanceof Error &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number' &&
    'type' in err &&
    typeof (err as { type: unknown }).type === 'string'
  );
}

/**
 * One `code` per `body-parser` failure type, so a caller can branch on why
 * its body was refused rather than only on the status. Types are documented
 * in `body-parser`'s `read()` and the `raw-body` package it delegates to.
 */
const BODY_PARSER_FAILURE_CODES: Readonly<Record<string, string>> = {
  'charset.unsupported': 'UNSUPPORTED_CHARSET',
  'encoding.unsupported': 'UNSUPPORTED_ENCODING',
  'entity.parse.failed': 'INVALID_JSON_BODY',
  'entity.too.large': 'PAYLOAD_TOO_LARGE',
  'entity.verify.failed': 'BODY_VERIFICATION_FAILED',
  'request.aborted': 'REQUEST_ABORTED',
  'request.size.invalid': 'REQUEST_SIZE_MISMATCH',
};

export const jsonBodyErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (!isBodyParserFailure(err)) {
    next(err);
    return;
  }

  res.status(err.status).json({
    message: err.message,
    code: BODY_PARSER_FAILURE_CODES[err.type] ?? 'INVALID_REQUEST_BODY',
  });
};
