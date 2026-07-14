import { describe, expect, it } from 'vitest';

import {
  INTERNAL_CREDENTIAL_HEADER,
  INTERNAL_TOKEN_HEADER,
  type InternalAuthConfig,
  type InternalCallerSpec,
  authenticateInternal,
  parseInternalCallers,
  passesInternalToken,
} from '../internal-token.js';

const INTERNAL_PATHS = new Set(['/ai-usage/record', '/ingest/worker-complete']);

describe('INTERNAL_TOKEN_HEADER', () => {
  it('is the canonical lowercase header name', () => {
    expect(INTERNAL_TOKEN_HEADER).toBe('x-pops-internal-token');
  });
});

describe('INTERNAL_CREDENTIAL_HEADER', () => {
  it('is the canonical lowercase per-caller credential header name', () => {
    expect(INTERNAL_CREDENTIAL_HEADER).toBe('x-pops-internal-credential');
  });
});

describe('passesInternalToken', () => {
  it('passes any path outside the internal set, ignoring the token', () => {
    expect(
      passesInternalToken({
        path: '/health',
        internalPaths: INTERNAL_PATHS,
        presentedToken: undefined,
        expectedToken: undefined,
      })
    ).toBe(true);
  });

  it('passes an internal path when the presented token matches the expected token', () => {
    expect(
      passesInternalToken({
        path: '/ai-usage/record',
        internalPaths: INTERNAL_PATHS,
        presentedToken: 'secret',
        expectedToken: 'secret',
      })
    ).toBe(true);
  });

  it('rejects an internal path when the tokens differ', () => {
    expect(
      passesInternalToken({
        path: '/ai-usage/record',
        internalPaths: INTERNAL_PATHS,
        presentedToken: 'wrong',
        expectedToken: 'secret',
      })
    ).toBe(false);
  });

  it('fails closed on an internal path when the callee has no expected token configured', () => {
    expect(
      passesInternalToken({
        path: '/ingest/worker-complete',
        internalPaths: INTERNAL_PATHS,
        presentedToken: 'anything',
        expectedToken: undefined,
      })
    ).toBe(false);
  });

  it('rejects an internal path when no token is presented but one is expected', () => {
    expect(
      passesInternalToken({
        path: '/ingest/worker-complete',
        internalPaths: INTERNAL_PATHS,
        presentedToken: undefined,
        expectedToken: 'secret',
      })
    ).toBe(false);
  });

  it('does not treat two absent tokens as a match (fail-closed)', () => {
    expect(
      passesInternalToken({
        path: '/ai-usage/record',
        internalPaths: INTERNAL_PATHS,
        presentedToken: undefined,
        expectedToken: undefined,
      })
    ).toBe(false);
  });

  it('rejects when the expected token is the empty string and none is presented', () => {
    expect(
      passesInternalToken({
        path: '/ai-usage/record',
        internalPaths: INTERNAL_PATHS,
        presentedToken: undefined,
        expectedToken: '',
      })
    ).toBe(false);
  });

  it('fails closed when an empty configured token meets an empty presented header', () => {
    expect(
      passesInternalToken({
        path: '/ai-usage/record',
        internalPaths: INTERNAL_PATHS,
        presentedToken: '',
        expectedToken: '',
      })
    ).toBe(false);
  });

  it('rejects an empty presented header against a real configured token', () => {
    expect(
      passesInternalToken({
        path: '/ingest/worker-complete',
        internalPaths: INTERNAL_PATHS,
        presentedToken: '',
        expectedToken: 'secret',
      })
    ).toBe(false);
  });
});

const AI_SCOPE = 'ai.usage.record';
const FOOD_SCOPE = 'food.ingest.worker-complete';

const AI_SPECS: readonly InternalCallerSpec[] = [
  { name: 'finance', scopes: [AI_SCOPE], secretEnv: 'SEC_FINANCE' },
  { name: 'food-worker', scopes: [AI_SCOPE], secretEnv: 'SEC_FOOD_WORKER' },
];

function aiConfig(overrides: Partial<InternalAuthConfig> = {}): InternalAuthConfig {
  return {
    pathScopes: new Map([
      ['/ai-usage/record', AI_SCOPE],
      ['/ingest/worker-complete', FOOD_SCOPE],
    ]),
    callers: parseInternalCallers(AI_SPECS, {
      SEC_FINANCE: 'finance-secret',
      SEC_FOOD_WORKER: 'food-secret',
    }),
    legacyToken: 'legacy-shared',
    ...overrides,
  };
}

describe('parseInternalCallers', () => {
  it('builds a caller per spec whose secret env is set, with scopes as a Set', () => {
    const callers = parseInternalCallers(AI_SPECS, {
      SEC_FINANCE: 'a',
      SEC_FOOD_WORKER: 'b',
    });
    expect(callers).toHaveLength(2);
    const finance = callers.find((c) => c.name === 'finance');
    expect(finance?.secret).toBe('a');
    expect(finance?.scopes.has(AI_SCOPE)).toBe(true);
  });

  it('drops a caller whose secret env is unset (never configured)', () => {
    const callers = parseInternalCallers(AI_SPECS, { SEC_FINANCE: 'a' });
    expect(callers.map((c) => c.name)).toEqual(['finance']);
  });

  it('drops a caller whose secret env is empty (revoked without a code change)', () => {
    const callers = parseInternalCallers(AI_SPECS, { SEC_FINANCE: 'a', SEC_FOOD_WORKER: '' });
    expect(callers.map((c) => c.name)).toEqual(['finance']);
  });
});

describe('authenticateInternal', () => {
  it('passes a path outside the scope map untouched', () => {
    const result = authenticateInternal({
      path: '/health',
      credentialHeader: undefined,
      legacyTokenHeader: undefined,
      config: aiConfig(),
    });
    expect(result).toEqual({ ok: true, reason: 'not-internal' });
  });

  it('authorises a known caller presenting a valid credential with the right scope', () => {
    const result = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: 'finance.finance-secret',
      legacyTokenHeader: undefined,
      config: aiConfig(),
    });
    expect(result).toEqual({ ok: true, caller: 'finance', reason: 'ok' });
  });

  it('resolves the caller name (not "legacy") when both credential and legacy are valid', () => {
    const result = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: 'finance.finance-secret',
      legacyTokenHeader: 'legacy-shared',
      config: aiConfig(),
    });
    expect(result).toEqual({ ok: true, caller: 'finance', reason: 'ok' });
  });

  it('hard-rejects a valid caller lacking the required scope — even with a valid legacy token', () => {
    // food-worker is configured with the AI scope only; it must not reach the
    // food-completion path, and a still-accepted legacy token cannot launder it.
    const result = authenticateInternal({
      path: '/ingest/worker-complete',
      credentialHeader: 'food-worker.food-secret',
      legacyTokenHeader: 'legacy-shared',
      config: aiConfig(),
    });
    expect(result).toEqual({ ok: false, caller: 'food-worker', reason: 'missing-scope' });
  });

  it('falls back to the legacy token when the credential names an unknown caller', () => {
    const result = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: 'ghost.whatever',
      legacyTokenHeader: 'legacy-shared',
      config: aiConfig(),
    });
    expect(result).toEqual({ ok: true, caller: 'legacy', reason: 'legacy' });
  });

  it('falls back to the legacy token when a known caller presents a wrong secret', () => {
    const result = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: 'finance.WRONG',
      legacyTokenHeader: 'legacy-shared',
      config: aiConfig(),
    });
    expect(result).toEqual({ ok: true, caller: 'legacy', reason: 'legacy' });
  });

  it('rejects a wrong secret with no legacy fallback configured', () => {
    const result = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: 'finance.WRONG',
      legacyTokenHeader: undefined,
      config: aiConfig({ legacyToken: undefined }),
    });
    expect(result).toEqual({ ok: false, reason: 'bad-secret' });
  });

  it('rejects an unknown caller with no legacy fallback', () => {
    const result = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: 'ghost.x',
      legacyTokenHeader: undefined,
      config: aiConfig({ legacyToken: undefined }),
    });
    expect(result).toEqual({ ok: false, reason: 'unknown-caller' });
  });

  it('treats a credential without an interior dot as an unknown caller', () => {
    const result = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: 'no-dot-here',
      legacyTokenHeader: undefined,
      config: aiConfig({ legacyToken: undefined }),
    });
    expect(result).toEqual({ ok: false, reason: 'unknown-caller' });
  });

  it('accepts a legacy token alone during the accept-both window', () => {
    const result = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: undefined,
      legacyTokenHeader: 'legacy-shared',
      config: aiConfig(),
    });
    expect(result).toEqual({ ok: true, caller: 'legacy', reason: 'legacy' });
  });

  it('rejects when neither a credential nor a legacy token is presented', () => {
    const result = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: undefined,
      legacyTokenHeader: undefined,
      config: aiConfig(),
    });
    expect(result).toEqual({ ok: false, reason: 'no-credential' });
  });

  it('rejects a legacy token once the legacy secret is retired (post-cutover)', () => {
    const result = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: undefined,
      legacyTokenHeader: 'legacy-shared',
      config: aiConfig({ legacyToken: undefined }),
    });
    expect(result).toEqual({ ok: false, reason: 'no-credential' });
  });

  it('revoking one caller leaves a sibling working (AC2)', () => {
    // Blank food-worker's secret env → it is dropped from the accepted set.
    const config = aiConfig({
      callers: parseInternalCallers(AI_SPECS, {
        SEC_FINANCE: 'finance-secret',
        SEC_FOOD_WORKER: '',
      }),
      legacyToken: undefined,
    });
    const revoked = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: 'food-worker.food-secret',
      legacyTokenHeader: undefined,
      config,
    });
    expect(revoked.ok).toBe(false);
    const sibling = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: 'finance.finance-secret',
      legacyTokenHeader: undefined,
      config,
    });
    expect(sibling).toEqual({ ok: true, caller: 'finance', reason: 'ok' });
  });

  it('does not treat an empty legacy token as a match', () => {
    const result = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: undefined,
      legacyTokenHeader: '',
      config: aiConfig({ legacyToken: '' }),
    });
    expect(result).toEqual({ ok: false, reason: 'no-credential' });
  });
});
