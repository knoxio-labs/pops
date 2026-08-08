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
 * route being added ungated. Here the surface that predates having a device is
 * enumerated by {@link DEVICE_FACING_PATHS} instead, and each member gets the
 * budget its own reasoning asks for rather than a share of one.
 */
export const PAIRING_PATH = bfmDeviceContract.pair.path;

/** Where a phone asks for the nonce it is about to sign. Derived, as above. */
export const CHALLENGE_PATH = bfmDeviceContract.challenge.path;

/** Where it spends that nonce along with its refresh token. Derived, as above. */
export const REFRESH_PATH = bfmDeviceContract.refresh.path;

/**
 * Every device-facing route: reachable without an Access session, without a
 * device row, without a token.
 *
 * Enumerated rather than folded into a `/devices` prefix mount on purpose. A
 * prefix would be the right shape if these shared one treatment, and they do
 * not — pairing and refresh carry different budgets for different reasons —
 * but they DO share the rule in `rest/request-validation.ts`: none of them may
 * answer ts-rest's native validation body, which names this server's schema
 * fields to whoever asked. Listing them here means a fourth route has one
 * place to be added rather than several to be remembered.
 */
export const DEVICE_FACING_PATHS = [PAIRING_PATH, CHALLENGE_PATH, REFRESH_PATH] as const;
