import { describe, expect, it } from 'vitest';

import { ListPurchasesQuerySchema } from '../../../contract/rest-schemas.js';
import { resolvePurchaseScope } from '../purchase-scope.js';

// The contract refuses an unreadable window bound before a route handler runs,
// so no REST request reaches this path any more; the scope reader keeps its own
// check rather than trusting every caller to have validated first.
describe('resolvePurchaseScope with a bound that names no instant', () => {
  const unreadable = '2026-01-01T00:00:00+99:00';
  const base = ListPurchasesQuerySchema.parse({});

  it.each(['from', 'to'] as const)('refuses an unreadable %s and names it', (parameter) => {
    const resolution = resolvePurchaseScope({ ...base, [parameter]: unreadable });

    expect(resolution.ok).toBe(false);
    if (resolution.ok) return;
    expect(resolution.body.code).toBe('UNREADABLE_TIMESTAMP');
    expect(resolution.body.message).toContain(parameter);
    expect(resolution.body.message).toContain(unreadable);
  });

  it('reads a well-formed pair of bounds into a canonical scope', () => {
    const resolution = resolvePurchaseScope({
      ...base,
      from: '2026-01-01T10:00:00+10:00',
      to: '2026-01-02T00:00:00Z',
    });

    expect(resolution.ok).toBe(true);
  });
});
