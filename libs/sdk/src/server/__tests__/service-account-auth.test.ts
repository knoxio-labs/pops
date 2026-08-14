import { describe, expect, it, vi } from 'vitest';

import {
  authorizeServiceAccountRequest,
  SERVICE_ACCOUNT_HEADER,
  type ServiceAccountVerification,
  type ServiceAccountVerifier,
} from '../service-account-auth.js';

const SCOPE = 'finance.transactions.list';

describe('SERVICE_ACCOUNT_HEADER', () => {
  it('is the lowercase wire spelling every producer and consumer must agree on', () => {
    // Pinned deliberately: this is the value every attaching caller (the
    // server SDK's pillar()) and every verifying callee (registry's identity
    // middleware, the pillar-express scope gate) reads off the wire. Changing
    // it here without changing it everywhere is a silent 401 across the fleet.
    expect(SERVICE_ACCOUNT_HEADER).toBe('x-api-key');
  });
});

function verifierReturning(verification: ServiceAccountVerification): ServiceAccountVerifier {
  return vi.fn(async () => Promise.resolve(verification));
}

const authenticated = (scopes: readonly string[]): ServiceAccountVerification => ({
  outcome: 'authenticated',
  principal: { id: 'sa_1', name: 'bfm', scopes },
});

describe('authorizeServiceAccountRequest', () => {
  it('passes a path outside the contract without consulting the verifier', async () => {
    const verify = verifierReturning({ outcome: 'rejected' });
    const result = await authorizeServiceAccountRequest({
      requiredScope: undefined,
      apiKey: 'anything',
      verify,
    });
    expect(result).toMatchObject({ ok: true, status: 200, reason: 'not-scoped' });
    expect(verify).not.toHaveBeenCalled();
  });

  describe('no credential', () => {
    it('rejects with 401 when the pillar requires one', async () => {
      const result = await authorizeServiceAccountRequest({
        requiredScope: SCOPE,
        apiKey: undefined,
        verify: verifierReturning({ outcome: 'rejected' }),
        requireCredential: true,
      });
      expect(result).toMatchObject({ ok: false, status: 401, reason: 'no-credential' });
    });

    it('treats an empty header as no credential', async () => {
      const result = await authorizeServiceAccountRequest({
        requiredScope: SCOPE,
        apiKey: '',
        verify: verifierReturning({ outcome: 'rejected' }),
        requireCredential: true,
      });
      expect(result).toMatchObject({ ok: false, status: 401, reason: 'no-credential' });
    });

    it('leaves an uncredentialled caller to the perimeter by default', async () => {
      const verify = verifierReturning({ outcome: 'rejected' });
      const result = await authorizeServiceAccountRequest({
        requiredScope: SCOPE,
        apiKey: undefined,
        verify,
      });
      expect(result).toMatchObject({ ok: true, status: 200, reason: 'anonymous' });
      expect(verify).not.toHaveBeenCalled();
    });
  });

  describe('a presented credential', () => {
    it('rejects an unknown or revoked key with 401', async () => {
      const result = await authorizeServiceAccountRequest({
        requiredScope: SCOPE,
        apiKey: 'pops_sa_dead.beef',
        verify: verifierReturning({ outcome: 'rejected' }),
      });
      expect(result).toMatchObject({ ok: false, status: 401, reason: 'invalid-credential' });
      expect(result.principal).toBeUndefined();
    });

    it('rejects a valid key whose grant does not cover the operation with 403', async () => {
      const result = await authorizeServiceAccountRequest({
        requiredScope: 'finance.budgets.list',
        apiKey: 'pops_sa_live.secret',
        verify: verifierReturning(authenticated(['finance.transactions'])),
      });
      expect(result).toMatchObject({
        ok: false,
        status: 403,
        reason: 'missing-scope',
        requiredScope: 'finance.budgets.list',
      });
      expect(result.principal?.name).toBe('bfm');
    });

    it('admits a valid key whose grant covers the operation by dot prefix', async () => {
      const result = await authorizeServiceAccountRequest({
        requiredScope: SCOPE,
        apiKey: 'pops_sa_live.secret',
        verify: verifierReturning(authenticated(['finance.transactions'])),
      });
      expect(result).toMatchObject({ ok: true, status: 200, reason: 'ok', requiredScope: SCOPE });
      expect(result.principal?.id).toBe('sa_1');
    });

    it('does not fall back to network trust when the credential is bad', async () => {
      const result = await authorizeServiceAccountRequest({
        requiredScope: SCOPE,
        apiKey: 'pops_sa_dead.beef',
        verify: verifierReturning({ outcome: 'rejected' }),
        requireCredential: false,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('when the registry cannot be reached', () => {
    it('fails closed with 503 rather than admitting the caller', async () => {
      const result = await authorizeServiceAccountRequest({
        requiredScope: SCOPE,
        apiKey: 'pops_sa_live.secret',
        verify: verifierReturning({ outcome: 'unavailable', detail: 'ECONNREFUSED' }),
      });
      expect(result).toMatchObject({ ok: false, status: 503, reason: 'unavailable' });
    });
  });
});
