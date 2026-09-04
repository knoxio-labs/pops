import { describe, expect, it } from 'vitest';

import { DEFAULT_ACCOUNT_FORM_VALUES, type AccountFormValues } from './types';
import { requiresGiftCardSecrets } from './useAccountsPage';

function values(overrides: Partial<AccountFormValues>): AccountFormValues {
  return { ...DEFAULT_ACCOUNT_FORM_VALUES, kind: 'gift-card', ...overrides };
}

describe('requiresGiftCardSecrets', () => {
  it('requires secrets when creating a new gift-card account with blank fields', () => {
    expect(requiresGiftCardSecrets(values({}), false)).toBe(true);
  });

  it('does not require secrets when editing an account that was already gift-card', () => {
    // Secrets are never echoed back into the form, so a blank field here means
    // "unchanged", not "missing" — POPS-2775's review-findings-gate finding.
    expect(requiresGiftCardSecrets(values({}), true)).toBe(false);
  });

  it('requires secrets when an edit just switched an existing account to gift-card', () => {
    expect(requiresGiftCardSecrets(values({}), false)).toBe(true);
  });

  it('does not require secrets once both fields are filled in', () => {
    expect(
      requiresGiftCardSecrets(values({ giftCardNumber: '1234', giftCardPin: '0000' }), false)
    ).toBe(false);
  });

  it('never requires secrets for a non-gift-card kind', () => {
    expect(requiresGiftCardSecrets(values({ kind: 'checking' }), false)).toBe(false);
  });
});
