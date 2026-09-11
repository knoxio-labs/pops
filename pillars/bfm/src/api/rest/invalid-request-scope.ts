/**
 * Which paths answer `{ code: 'invalid_request', message }`, and the body
 * itself.
 *
 * Shared by two error handlers that reshape two different failures on the
 * same paths: ts-rest's own request-validation rejection
 * (`request-validation.ts`) and body-parser's JSON-parse rejection
 * (`json-body-error.ts`). Both must draw the identical line around
 * "device-facing", or the same route would answer this shape for one failure
 * and ts-rest's/Express's native one for the other.
 */
import { DEVICE_FACING_PATHS, MOBILE_PATH_PREFIX } from '../paths.js';

import type { DeviceInvalidRequestError } from '../../contract/rest-device-schemas.js';
import type { MobileRequestError } from '../../contract/rest-schemas.js';

/**
 * All either handler reads off the request. Declared structurally rather than
 * as express's `Request` because ts-rest hands `request-validation.ts` a
 * `TsRestRequest<…>` narrowed to the contract, which is not assignable to the
 * plain express type.
 */
export type PathOnlyRequest = { readonly path: string };

/**
 * One constant, typed against both contracts that declare it — the `/mobile`
 * routes' `MobileRequestErrorSchema` and the device routes' own 400. The two
 * are independent shapes that happen to agree on this value, so annotating it
 * twice is what keeps them from drifting apart silently: drop
 * `invalid_request` from either and this stops compiling.
 */
export const INVALID_REQUEST: MobileRequestError & DeviceInvalidRequestError = {
  code: 'invalid_request',
  message: 'This request does not match what the server accepts.',
};

function isUnderPrefix(path: string, prefix: string): boolean {
  // Whole-segment match, the same rule `app.use` applies when mounting the
  // perimeter — so `/mobiles` is not treated as `/mobile`.
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isDeviceFacingPath(req: PathOnlyRequest): boolean {
  if (isUnderPrefix(req.path, MOBILE_PATH_PREFIX)) return true;
  return DEVICE_FACING_PATHS.some((path) => isUnderPrefix(req.path, path));
}
