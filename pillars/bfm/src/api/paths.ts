/**
 * Path prefixes the app mounts on, in a module of their own so middleware can
 * name one without importing `app.ts` — which imports the middleware, and
 * would be a cycle.
 */

/**
 * The path prefix every route the phone calls lives under, and therefore the
 * one the perimeter mounts on.
 *
 * A single prefix rather than a per-route list is the point: `app.use` matches
 * on whole path segments, so everything below `/mobile` is gated the moment it
 * exists and nothing below it can be added ungated by accident.
 */
export const MOBILE_PATH_PREFIX = '/mobile';
