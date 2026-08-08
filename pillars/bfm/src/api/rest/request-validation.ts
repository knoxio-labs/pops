/**
 * ts-rest's request-validation failures, reshaped for the phone.
 *
 * ts-rest rejects a request that does not match a route's `query`/`params`/
 * `body` schema **before** any handler runs, and answers with its own error
 * body — `{ name: 'ValidationError', issues: [...] }`. That shape is nothing
 * like the 400 the `/mobile` routes declare, so without this the routes
 * promise one thing in the OpenAPI document and emit another: a 400 the
 * generated Swift client has no case for, reached by something as ordinary as
 * `?limit=500`.
 *
 * Only the **device-facing** routes are reshaped: `/mobile/*` and the pairing
 * exchange, which declares its own 400 for the same reason and answers the
 * same `invalid_request` body. The operator routes declare no 400 at all, so
 * there is nothing there for a native body to contradict, and quietly changing
 * what they answer is not this ticket's business — they keep ts-rest's default
 * verbatim, which is why the default is reproduced below rather than delegated
 * to. It is four lines of vendor behaviour; the alternative was to have no
 * default at all, which would turn every operator validation failure into a
 * 500.
 *
 * There is a second reason to reshape the pairing route specifically, beyond
 * the client having a case for it: ts-rest's body names the fields it rejected,
 * and that route is reachable unauthenticated on an Access-bypassed hostname.
 * A description of the schema is not something to hand whoever asks.
 */
import { RequestValidationError } from '@ts-rest/express';

import { MOBILE_PATH_PREFIX, PAIRING_PATH } from '../paths.js';

import type { NextFunction, Response } from 'express';

import type { PairingInvalidRequestError } from '../../contract/rest-device-schemas.js';
import type { MobileRequestError } from '../../contract/rest-schemas.js';

/**
 * All this handler reads. Declared structurally rather than as express's
 * `Request` because ts-rest hands it a `TsRestRequest<…>` narrowed to the
 * contract, which is not assignable to the plain express type.
 */
type PathOnlyRequest = { readonly path: string };

/**
 * One constant, typed against both contracts that declare it — the `/mobile`
 * routes' `MobileRequestErrorSchema` and the pairing route's own 400. The two
 * are independent shapes that happen to agree on this value, so annotating it
 * twice is what keeps them from drifting apart silently: drop `invalid_request`
 * from either and this stops compiling.
 */
const INVALID_REQUEST: MobileRequestError & PairingInvalidRequestError = {
  code: 'invalid_request',
  message: 'This request does not match what the server accepts.',
};

/**
 * ts-rest's own precedence: path params, then headers, then query, then body.
 * Mirrored so a non-mobile route answers exactly what it answered before this
 * handler existed.
 */
function defaultBody(error: RequestValidationError): unknown {
  return error.pathParams ?? error.headers ?? error.query ?? error.body;
}

function isUnderPrefix(path: string, prefix: string): boolean {
  // Whole-segment match, the same rule `app.use` applies when mounting the
  // perimeter — so `/mobiles` is not treated as `/mobile`.
  return path === prefix || path.startsWith(`${prefix}/`);
}

function isDeviceFacingPath(req: PathOnlyRequest): boolean {
  return isUnderPrefix(req.path, MOBILE_PATH_PREFIX) || isUnderPrefix(req.path, PAIRING_PATH);
}

export function createRequestValidationErrorHandler() {
  return (error: unknown, req: PathOnlyRequest, res: Response, next: NextFunction): void => {
    if (!(error instanceof RequestValidationError)) {
      next(error);
      return;
    }

    if (isDeviceFacingPath(req)) {
      // The issues themselves are deliberately dropped. They name this
      // server's internal schema fields, they are not localised, and the app
      // renders its own copy from `code` — carrying them would be a payload
      // the phone pays for and never shows.
      res.status(400).json(INVALID_REQUEST);
      return;
    }

    res.status(400).json(defaultBody(error));
  };
}
