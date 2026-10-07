import { describe, expect, it } from 'vitest';

import { MobileAccountSchema } from '../../../contract/account.js';
import { financeAccountRow } from '../../__tests__/finance-fake.js';
import { FinanceAccountRowSchema, toMobileAccount } from '../wire.js';

describe("an account's viewer role", () => {
  it.each(['owner', 'view', 'edit'])('passes %s through as finance sent it', (viewerRole) => {
    const row = FinanceAccountRowSchema.parse({
      ...financeAccountRow({ id: 'acc-1' }),
      viewerRole,
    });

    expect(toMobileAccount(row).viewerRole).toBe(viewerRole);
  });

  it('passes through a role this build has never heard of rather than failing the account', () => {
    const row = FinanceAccountRowSchema.parse({
      ...financeAccountRow({ id: 'acc-1' }),
      viewerRole: 'comment',
    });

    expect(MobileAccountSchema.parse(toMobileAccount(row)).viewerRole).toBe('comment');
  });

  it('is left off, not invented, when finance sends none', () => {
    const account = toMobileAccount(
      FinanceAccountRowSchema.parse(financeAccountRow({ id: 'acc-1' }))
    );

    expect('viewerRole' in account).toBe(false);
    expect(() => MobileAccountSchema.parse(account)).not.toThrow();
  });

  it('refuses a role that is not a string', () => {
    const parsed = FinanceAccountRowSchema.safeParse({
      ...financeAccountRow({ id: 'acc-1' }),
      viewerRole: 3,
    });

    expect(parsed.success).toBe(false);
  });
});
