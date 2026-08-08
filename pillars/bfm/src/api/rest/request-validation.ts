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
 * Only `/mobile` is reshaped. The operator routes declare no 400 at all, so
 * there is nothing there for a native body to contradict, and quietly changing
 * what they answer is not this ticket's business — they keep ts-rest's default
 * verbatim, which is why the default is reproduced below rather than delegated
 * to. It is four lines of vendor behaviour; the alternative was to have no
 * default at all, which would turn every operator validation failure into a
 * 500.
 */
import { RequestValidationError } from '@ts-rest/express';

import { MOBILE_PATH_PREFIX } from '../paths.js';

import type { NextFunction, Response } from 'express';

import type { MobileRequestError } from '../../contract/rest-schemas.js';

/**
 * All this handler reads. Declared structurally rather than as express's
 * `Request` because ts-rest hands it a `TsRestRequest<…>` narrowed to the
 * contract, which is not assignable to the plain express type.
 */
type PathOnlyRequest = { readonly path: string };

const INVALID_REQUEST: MobileRequestError = {
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

function isMobilePath(req: PathOnlyRequest): boolean {
  // Whole-segment match, the same rule `app.use` applies when mounting the
  // perimeter — so `/mobiles` is not treated as `/mobile`.
  return req.path === MOBILE_PATH_PREFIX || req.path.startsWith(`${MOBILE_PATH_PREFIX}/`);
}

export function createRequestValidationErrorHandler() {
  return (error: unknown, req: PathOnlyRequest, res: Response, next: NextFunction): void => {
    if (!(error instanceof RequestValidationError)) {
      next(error);
      return;
    }

    if (isMobilePath(req)) {
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
