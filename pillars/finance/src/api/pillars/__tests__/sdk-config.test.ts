/**
 * `configureFinanceServerSdk` is the one place that binds the process-wide
 * outbound call budget (`callTimeoutMs`) alongside the service-account key.
 * `outbound-credential.test.ts` drives the same function end to end but
 * against a server that always answers instantly, so it would pass
 * identically whether the timeout were 8s, 800s, or absent entirely — it
 * proves the key reaches the wire, not that the budget does. This asserts
 * the value `configureServerSdk` actually receives, on both the credentialed
 * and no-key paths.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const configureServerSdkMock = vi.hoisted(() => vi.fn());
vi.mock('@pops/pillar-sdk/server', () => ({
  configureServerSdk: configureServerSdkMock,
}));

import { configureFinanceServerSdk } from '../sdk-config.js';
import { SERVICE_ACCOUNT_KEY_ENV } from '../service-account.js';

const SERVICE_ACCOUNT_KEY = 'pops_sa_TESTTEST.testsecret_not_a_real_key_000000';

describe('configureFinanceServerSdk — outbound call budget', () => {
  beforeEach(() => {
    configureServerSdkMock.mockClear();
  });

  it('binds an 8s callTimeoutMs alongside the key when one is found', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    configureFinanceServerSdk({ [SERVICE_ACCOUNT_KEY_ENV]: SERVICE_ACCOUNT_KEY });

    expect(configureServerSdkMock).toHaveBeenCalledExactlyOnceWith({
      apiKey: SERVICE_ACCOUNT_KEY,
      callTimeoutMs: 8_000,
    });
  });

  it('still binds the 8s callTimeoutMs when no key is found, so a later credentialled reload cannot inherit a stale (or missing) budget', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    configureFinanceServerSdk({});

    expect(configureServerSdkMock).toHaveBeenCalledExactlyOnceWith({
      apiKey: undefined,
      callTimeoutMs: 8_000,
    });
  });
});
