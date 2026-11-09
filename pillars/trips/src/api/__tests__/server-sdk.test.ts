import { afterEach, describe, expect, it, vi } from 'vitest';

import { __resetServerSdkConfig, getServerSdkConfig } from '@pops/pillar-sdk/server';

import { configureTripsServerSdk } from '../server-sdk.js';

afterEach(() => __resetServerSdkConfig());
describe('Trips outbound SDK configuration', () => {
  it('prefers a trimmed mounted file source without mutating the environment', () => {
    const env = {
      POPS_INTERNAL_API_KEY_FILE: ' /mounted/key ',
      POPS_INTERNAL_API_KEY: 'local-test-value',
    };
    const read = vi.fn(() => '  file-test-value\n');
    expect(configureTripsServerSdk(env, read)).toBe(true);
    expect(read).toHaveBeenCalledWith('/mounted/key');
    expect(getServerSdkConfig().apiKey).toBe('file-test-value');
    expect(env.POPS_INTERNAL_API_KEY).toBe('local-test-value');
  });
  it('supports local environment configuration and absent keys without touching files', () => {
    const read = vi.fn(() => 'unused');
    expect(configureTripsServerSdk({ POPS_INTERNAL_API_KEY: ' local-test-value ' }, read)).toBe(
      true
    );
    expect(getServerSdkConfig().apiKey).toBe('local-test-value');
    expect(configureTripsServerSdk({}, read)).toBe(false);
    expect(getServerSdkConfig().apiKey).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });
  it('falls back from an empty file but refuses an unreadable configured file', () => {
    expect(
      configureTripsServerSdk(
        { POPS_INTERNAL_API_KEY_FILE: '/mounted/key', POPS_INTERNAL_API_KEY: 'local-test-value' },
        () => '  '
      )
    ).toBe(true);
    expect(getServerSdkConfig().apiKey).toBe('local-test-value');
    expect(() =>
      configureTripsServerSdk({ POPS_INTERNAL_API_KEY_FILE: '/missing/key' }, () => {
        throw new Error('unreadable');
      })
    ).toThrow('unreadable');
  });
});
