import { describe, expect, it } from 'vitest';

import {
  INTERNAL_CREDENTIAL_HEADER,
  type InternalAuthConfig,
  type InternalCallerSpec,
  authenticateInternal,
  parseInternalCallers,
} from '../internal-token.js';

describe('INTERNAL_CREDENTIAL_HEADER', () => {
  it('is the canonical lowercase per-caller credential header name', () => {
    expect(INTERNAL_CREDENTIAL_HEADER).toBe('x-pops-internal-credential');
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
      config: aiConfig(),
    });
    expect(result).toEqual({ ok: true, reason: 'not-internal' });
  });

  it('authorises a known caller presenting a valid credential with the right scope', () => {
    const result = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: 'finance.finance-secret',
      config: aiConfig(),
    });
    expect(result).toEqual({ ok: true, caller: 'finance', reason: 'ok' });
  });

  it('accepts a secret that itself contains dots (split on the FIRST dot only)', () => {
    const config = aiConfig({
      callers: parseInternalCallers(AI_SPECS, {
        SEC_FINANCE: 'a.b.c',
        SEC_FOOD_WORKER: 'x',
      }),
    });
    const result = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: 'finance.a.b.c',
      config,
    });
    expect(result).toEqual({ ok: true, caller: 'finance', reason: 'ok' });
  });

  it('rejects a valid caller lacking the required scope (403), naming the caller', () => {
    // food-worker holds only the AI scope here; it must not reach the food path.
    const result = authenticateInternal({
      path: '/ingest/worker-complete',
      credentialHeader: 'food-worker.food-secret',
      config: aiConfig(),
    });
    expect(result).toEqual({ ok: false, caller: 'food-worker', reason: 'missing-scope' });
  });

  it('rejects an unknown caller', () => {
    const result = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: 'ghost.whatever',
      config: aiConfig(),
    });
    expect(result).toEqual({ ok: false, reason: 'unknown-caller' });
  });

  it('rejects a known caller presenting a wrong secret', () => {
    const result = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: 'finance.WRONG',
      config: aiConfig(),
    });
    expect(result).toEqual({ ok: false, reason: 'bad-secret' });
  });

  it('treats a credential without an interior dot as an unknown caller', () => {
    const result = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: 'no-dot-here',
      config: aiConfig(),
    });
    expect(result).toEqual({ ok: false, reason: 'unknown-caller' });
  });

  it('rejects an empty credential header on an internal path', () => {
    expect(
      authenticateInternal({ path: '/ai-usage/record', credentialHeader: '', config: aiConfig() })
    ).toEqual({ ok: false, reason: 'no-credential' });
  });

  it('rejects a missing credential header on an internal path', () => {
    expect(
      authenticateInternal({
        path: '/ai-usage/record',
        credentialHeader: undefined,
        config: aiConfig(),
      })
    ).toEqual({ ok: false, reason: 'no-credential' });
  });

  it('revoking one caller leaves a sibling working (AC2)', () => {
    // Blank food-worker's secret env → it is dropped from the accepted set.
    const config = aiConfig({
      callers: parseInternalCallers(AI_SPECS, {
        SEC_FINANCE: 'finance-secret',
        SEC_FOOD_WORKER: '',
      }),
    });
    const revoked = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: 'food-worker.food-secret',
      config,
    });
    expect(revoked).toEqual({ ok: false, reason: 'unknown-caller' });
    const sibling = authenticateInternal({
      path: '/ai-usage/record',
      credentialHeader: 'finance.finance-secret',
      config,
    });
    expect(sibling).toEqual({ ok: true, caller: 'finance', reason: 'ok' });
  });
});
