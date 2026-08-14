/**
 * Redis resolution for pillar job queues.
 *
 * Redis is OPTIONAL for a POPS pillar — a pillar with no `REDIS_URL` /
 * `REDIS_HOST` runs in degraded mode with queues and cache disabled — so the
 * resolver returns `null` rather than throwing, and every queue factory in
 * this package is `null`-valued for the same reason. Callers branch on that
 * `null` once, at construction, instead of guarding every call site.
 *
 * The precedence (`REDIS_URL`, then `REDIS_HOST` + `REDIS_PORT`) is the one
 * the food and cerebrum producers already used; this is that logic, deduped.
 */
import { Redis, type RedisOptions } from 'ioredis';

/** Env slice the resolver reads. `process.env` satisfies it. */
export type RedisEnv = Readonly<Record<string, string | undefined>>;

const DEFAULT_REDIS_PORT = '6379';

/**
 * The configured Redis URL, or `null` when this pillar has no Redis. An empty
 * value counts as unset — compose passes `REDIS_URL: ''` to disable a pillar's
 * queue without removing the key.
 */
export function resolveRedisUrl(env: RedisEnv = process.env): string | null {
  const url = env['REDIS_URL'];
  if (url !== undefined && url.length > 0) return url;
  const host = env['REDIS_HOST'];
  if (host === undefined || host.length === 0) return null;
  const port = env['REDIS_PORT'];
  return `redis://${host}:${port !== undefined && port.length > 0 ? port : DEFAULT_REDIS_PORT}`;
}

/**
 * A connection shaped the way BullMQ requires: `maxRetriesPerRequest: null`,
 * without which a blocking command (every worker's `brpoplpush`) is aborted
 * by ioredis mid-wait and the worker dies on a `MaxRetriesPerRequestError`.
 */
export function createJobsConnection(url: string, options: RedisOptions = {}): Redis {
  return new Redis(url, { ...options, maxRetriesPerRequest: null });
}
