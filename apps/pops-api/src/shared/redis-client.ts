/**
 * Optional Redis client for caching and BullMQ queues.
 *
 * Redis is not required — the API starts and operates without it (degraded mode:
 * queues and caching disabled). Configure via REDIS_URL env var.
 */
import * as IORedis from 'ioredis';

type RedisClient = IORedis.Redis;

let _redis: RedisClient | null = null;
let _redisAvailable = false;

export function getRedis(): RedisClient | null {
  return _redis;
}

export function isRedisAvailable(): boolean {
  return _redisAvailable;
}

export function initRedis(): void {
  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) {
    console.warn('[redis] REDIS_URL not set — caching and queue features disabled');
    return;
  }

  _redis = new IORedis.Redis(redisUrl, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  });

  _redis.on('ready', () => {
    _redisAvailable = true;
    console.warn('[redis] Connected');
  });

  _redis.on('error', (err: Error) => {
    if (_redisAvailable) {
      console.error('[redis] Connection lost:', err.message);
    }
    _redisAvailable = false;
  });

  _redis.connect().catch(() => {
    console.warn('[redis] Initial connection failed — operating without Redis');
  });
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
    _redisAvailable = false;
  }
}

const REDIS_PREFIX = process.env['REDIS_PREFIX'] ?? 'pops:';

export function redisKey(...parts: string[]): string {
  return REDIS_PREFIX + parts.join(':');
}
