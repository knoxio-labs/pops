/**
 * The transport adapter's fold from SDK {@link CallResult} discriminants to
 * the cron's five outcomes.
 *
 * Worth its own file because this mapping is where a wrong answer becomes a
 * wrong write: `not-found` is the ONLY discriminant licensed to stamp
 * `owner_uri_stale_at`, and anything read as `not-found` by mistake marks a
 * live reference dead. The SDK proxy is mocked — this is about the mapping,
 * not the network. The credential fold (a process with no key at all) is
 * covered end to end, over the real SDK, by
 * `../../pillars/__tests__/outbound-credential.test.ts` (POPS-2021).
 */
import { describe, expect, it, vi } from 'vitest';

import type { CallResult } from '@pops/pillar-sdk/server';

const usersGet =
  vi.fn<(input: { uri: string }) => Promise<CallResult<{ data: { uri: string } }>>>();

/**
 * `/server`, not `/client`. Mocking the wrong subpath here would leave the
 * adapter calling the real, unauthenticated proxy and this file would still
 * pass — which is exactly the substitution POPS-2021 exists to prevent.
 */
vi.mock('@pops/pillar-sdk/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pops/pillar-sdk/server')>();
  return {
    ...actual,
    pillar: (): unknown => ({ users: { get: usersGet } }),
  };
});

const { createPillarOwnerUriLookup } = await import('../pillar-lookup.js');

const URI = 'pops://core/user/alice@example.com';

const CASES: readonly [string, CallResult<{ data: { uri: string } }>, unknown][] = [
  ['ok', { kind: 'ok', value: { data: { uri: URI } } }, { kind: 'ok' }],
  ['not-found', { kind: 'not-found', pillar: 'registry' }, { kind: 'not-found' }],
  [
    'bad-request',
    { kind: 'bad-request', pillar: 'registry', message: 'unsupported-uri' },
    { kind: 'bad-uri', reason: 'unsupported-uri' },
  ],
  [
    'unavailable',
    { kind: 'unavailable', pillar: 'registry' },
    { kind: 'unavailable', reason: 'unavailable' },
  ],
  [
    'degraded',
    { kind: 'degraded', pillar: 'registry', reason: 'reconciling' },
    { kind: 'unavailable', reason: 'degraded' },
  ],
  [
    'unauthorized',
    { kind: 'unauthorized', pillar: 'registry' },
    // NOT `unavailable`. The registry answered; it refused this pillar's
    // credential, which no amount of waiting resolves.
    { kind: 'unauthorized', reason: 'unauthorized' },
  ],
  [
    'conflict',
    { kind: 'conflict', pillar: 'registry' },
    { kind: 'unavailable', reason: 'conflict' },
  ],
  [
    'contract-mismatch',
    { kind: 'contract-mismatch', pillar: 'registry', expected: 'users.get' },
    { kind: 'unavailable', reason: 'contract-mismatch' },
  ],
];

describe('createPillarOwnerUriLookup', () => {
  it.each(CASES)('folds %s', async (_label, result, expected) => {
    usersGet.mockResolvedValue(result);

    await expect(createPillarOwnerUriLookup()(URI)).resolves.toEqual(expected);
  });

  it('addresses the lookup by the URI verbatim', async () => {
    usersGet.mockResolvedValue({ kind: 'ok', value: { data: { uri: URI } } });

    await createPillarOwnerUriLookup()(URI);

    expect(usersGet).toHaveBeenCalledWith({ uri: URI });
  });

  it('falls back to a generic reason when bad-request carries no message', async () => {
    usersGet.mockResolvedValue({ kind: 'bad-request', pillar: 'registry' });

    await expect(createPillarOwnerUriLookup()(URI)).resolves.toEqual({
      kind: 'bad-uri',
      reason: 'bad-request',
    });
  });
});
