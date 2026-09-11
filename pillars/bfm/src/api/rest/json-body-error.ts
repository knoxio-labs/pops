/**
 * body-parser's JSON-parse refusal, reshaped for the phone.
 *
 * `express.json()` runs in strict mode: a body that is not syntactically
 * valid JSON, or IS valid JSON but not an object or array at the top level (a
 * bare string, number, `true`, `false` or `null`), makes it throw before any
 * route matches — via `next(err)`, not a response. Left alone, that throw
 * reaches Express's own default handler, which answers a `400` with an EMPTY
 * body rather than anything a generated client has a case for: every declared
 * error schema on these routes requires a `code`, so the phone decodes this as
 * a failure to decode at all rather than the `invalid_request` the route
 * means.
 *
 * `../request-validation.ts` already reshapes ts-rest's OWN validation
 * rejection into this same body on the same paths — a JSON *array*, say,
 * reaches ts-rest and is rejected there. This handler covers the failure
 * upstream of that: a body ts-rest never gets to see, because body-parser
 * refused it first. `invalid-request-scope.ts` is what keeps the two drawing
 * the same line around which paths get reshaped.
 *
 * Mounted directly after `express.json()`, ahead of every other middleware,
 * so it is the first error handler in the stack for this failure — anything
 * past this point that calls `next(err)` with an unrelated error, or a
 * body-parser failure of a different `type` (`payload-too-large.ts` handles
 * `entity.too.large` on its own), falls through unchanged.
 */
import { INVALID_REQUEST, isDeviceFacingPath } from './invalid-request-scope.js';

import type { PathOnlyRequest } from './invalid-request-scope.js';

/**
 * All this handler does to the response, declared structurally for the same
 * reason the request is: express's own `Response` carries a hundred members a
 * test double would have to fake to satisfy the compiler.
 */
type JsonResponse = { status: (code: number) => { json: (body: unknown) => unknown } };

/**
 * The one call this handler makes into express's chain. Declared structurally
 * rather than as `NextFunction`, whose `'route' | 'router'` overload nothing
 * here uses and no test double can express.
 */
type PassToNext = (error?: unknown) => void;

/**
 * body-parser's own discriminant for a body that failed to parse as JSON —
 * whether the bytes were not valid JSON at all, or were valid JSON but not an
 * object/array at the top level. Both throw with this same `type`; neither is
 * `entity.too.large`, which `payload-too-large.ts` owns.
 */
const JSON_PARSE_FAILURE_TYPE = 'entity.parse.failed';

function isJsonParseFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('type' in error)) return false;
  return error.type === JSON_PARSE_FAILURE_TYPE;
}

export function createJsonBodyErrorHandler() {
  return (error: unknown, req: PathOnlyRequest, res: JsonResponse, next: PassToNext): void => {
    if (!isJsonParseFailure(error) || !isDeviceFacingPath(req)) {
      next(error);
      return;
    }

    res.status(400).json(INVALID_REQUEST);
  };
}
