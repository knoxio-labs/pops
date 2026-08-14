import { describe, expect, it } from 'vitest';

import { resolveRedisUrl } from '../redis.js';

describe('resolveRedisUrl', () => {
  it('prefers an explicit URL', () => {
    expect(resolveRedisUrl({ REDIS_URL: 'redis://a:6379', REDIS_HOST: 'b' })).toBe(
      'redis://a:6379'
    );
  });

  it('composes host and port when only the host is set', () => {
    expect(resolveRedisUrl({ REDIS_HOST: 'pops-redis', REDIS_PORT: '6380' })).toBe(
      'redis://pops-redis:6380'
    );
  });

  it('defaults the port', () => {
    expect(resolveRedisUrl({ REDIS_HOST: 'pops-redis' })).toBe('redis://pops-redis:6379');
  });

  it('reads a blank value as unset, which is how a pillar opts out of queues', () => {
    expect(resolveRedisUrl({ REDIS_URL: '', REDIS_HOST: '' })).toBeNull();
    expect(resolveRedisUrl({ REDIS_URL: '', REDIS_HOST: 'pops-redis', REDIS_PORT: '' })).toBe(
      'redis://pops-redis:6379'
    );
  });

  it('is null when nothing is configured — degraded mode, not a crash', () => {
    expect(resolveRedisUrl({})).toBeNull();
  });
});
