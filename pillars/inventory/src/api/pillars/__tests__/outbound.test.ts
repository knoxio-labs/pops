/**
 * Unit coverage for {@link credentialled}'s own branches — the parts
 * `outbound-credential.test.ts`'s wire-level suite never exercises directly
 * because every one of its scenarios reaches `credentialled()` through a
 * real `PillarServerSdkError` (no key) or not at all (a key present).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PillarServerSdkError, type PillarHandle } from '@pops/pillar-sdk/server';

import {
  credentialled,
  credentialRejectedMessage,
  __resetOutboundCredentialReports,
} from '../outbound.js';

afterEach(() => {
  __resetOutboundCredentialReports();
});

interface StubRouter {
  ping: () => Promise<{ data: string }>;
}

function stubHandle(): PillarHandle<StubRouter> {
  return { ping: () => Promise.resolve({ data: 'pong' }) } as unknown as PillarHandle<StubRouter>;
}

describe('credentialled', () => {
  it('returns the connected handle when connect() succeeds', () => {
    const handle = stubHandle();

    expect(credentialled('ai', () => handle)).toBe(handle);
  });

  it('returns null and logs once when connect() throws a missing-key error', () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = credentialled<StubRouter>('ai', () => {
      throw new PillarServerSdkError('no key configured');
    });

    expect(result).toBeNull();
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("cannot call 'ai'"));
    errorLog.mockRestore();
  });

  it('logs a missing-key pillar only once, on the first call', () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const throwMissingKey = (): PillarHandle<StubRouter> => {
      throw new PillarServerSdkError('no key configured');
    };

    credentialled('ai', throwMissingKey);
    credentialled('ai', throwMissingKey);
    credentialled('ai', throwMissingKey);

    expect(errorLog).toHaveBeenCalledTimes(1);
    errorLog.mockRestore();
  });

  it('reports a distinct pillar id again, independently of one already reported', () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const throwMissingKey = (): PillarHandle<StubRouter> => {
      throw new PillarServerSdkError('no key configured');
    };

    credentialled('ai', throwMissingKey);
    credentialled('another-pillar', throwMissingKey);

    expect(errorLog).toHaveBeenCalledTimes(2);
    errorLog.mockRestore();
  });

  it('rethrows an error that is not a missing-key configuration problem', () => {
    const boom = new Error('the connection reset mid-handshake');

    expect(() =>
      credentialled<StubRouter>('ai', () => {
        throw boom;
      })
    ).toThrow(boom);
  });

  it('resets the once-per-pillar report so a later boot can log again', () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const throwMissingKey = (): PillarHandle<StubRouter> => {
      throw new PillarServerSdkError('no key configured');
    };

    credentialled('ai', throwMissingKey);
    __resetOutboundCredentialReports();
    credentialled('ai', throwMissingKey);

    expect(errorLog).toHaveBeenCalledTimes(2);
    errorLog.mockRestore();
  });
});

describe('credentialRejectedMessage', () => {
  it('names the pillar, the operation and the account', () => {
    const message = credentialRejectedMessage('ai', 'codes.rank');

    expect(message).toContain('ai');
    expect(message).toContain('codes.rank');
    expect(message).toContain('inventory');
  });
});
