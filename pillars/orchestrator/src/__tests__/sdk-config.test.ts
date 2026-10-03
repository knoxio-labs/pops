import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const configureServerSdkMock = vi.hoisted(() => vi.fn());
vi.mock('@pops/pillar-sdk/server', () => ({ configureServerSdk: configureServerSdkMock }));

import { configureOrchestratorServerSdk } from '../sdk-config.js';
import { SERVICE_ACCOUNT_KEY_ENV } from '../service-account.js';

const SERVICE_ACCOUNT_KEY = 'pops_sa_TESTTEST.testsecret_not_a_real_key_000000';

describe('configureOrchestratorServerSdk', () => {
  beforeEach(() => {
    configureServerSdkMock.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('binds the resolved key to the server SDK', () => {
    expect(configureOrchestratorServerSdk({ [SERVICE_ACCOUNT_KEY_ENV]: SERVICE_ACCOUNT_KEY })).toBe(
      true
    );
    expect(configureServerSdkMock).toHaveBeenCalledExactlyOnceWith({ apiKey: SERVICE_ACCOUNT_KEY });
  });

  it('clears a stale key and reports that outbound search is not configured', () => {
    expect(configureOrchestratorServerSdk({})).toBe(false);
    expect(configureServerSdkMock).toHaveBeenCalledExactlyOnceWith({ apiKey: undefined });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Federated search cannot call search-capable pillars.')
    );
  });
});
