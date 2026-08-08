/**
 * Paths the app mounts middleware on, in a module of their own so middleware
 * can name one without importing `app.ts` — which imports the middleware, and
 * would be a cycle.
 */
import { bfmDeviceContract } from '../contract/rest-device.js';

/**
 * The path prefix every route the phone calls lives under, and therefore the
 * one the perimeter mounts on.
 *
 * A single prefix rather than a per-route list is the point: `app.use` matches
 * on whole path segments, so everything below `/mobile` is gated the moment it
 * exists and nothing below it can be added ungated by accident.
 */
export const MOBILE_PATH_PREFIX = '/mobile';

/**
 * The pairing exchange's path, needed as a string because its budget is
 * mounted on it rather than checked inside its handler.
 *
 * Read off the contract rather than written out. A mount that silently stops
 * matching is a budget that silently stops being charged, and every test in
 * `__tests__/device-pairing.test.ts` would still pass against an unbudgeted
 * route because they post to this same constant. Deriving it means the mount
 * cannot drift from the route it guards; there is one string.
 *
 * Exactly one route, not a prefix — the opposite of {@link MOBILE_PATH_PREFIX}
 * and for the opposite reason. There, gating a prefix is what stops a future
 * route being added ungated. Here this is the whole surface that predates
 * having a device, and refresh (POPS-1375) will want its own budget with its
 * own numbers rather than a share of this one's.
 */
export const PAIRING_PATH = bfmDeviceContract.pair.path;
