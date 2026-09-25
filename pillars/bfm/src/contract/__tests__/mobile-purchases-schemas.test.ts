/**
 * `MobileSearchQuerySchema.status` restates `purchases`' own closed
 * reconciliation vocabulary (ADR-040) rather than importing it. POPS-4648
 * added `nothing_to_settle` to that vocabulary — this is the test that
 * would have caught the restated copy going stale.
 */
import { describe, expect, it } from 'vitest';

import { MobileSearchQuerySchema } from '../mobile-purchases-schemas.js';

describe('MobileSearchQuerySchema.status', () => {
  it.each([
    'awaiting_settlement',
    'linked',
    'partial',
    'settled_cash',
    'ignored',
    'nothing_to_settle',
  ])('accepts %s', (status) => {
    const result = MobileSearchQuerySchema.safeParse({ q: 'coffee', status });
    expect(result.success).toBe(true);
  });

  it('refuses a status the pillar has never published', () => {
    const result = MobileSearchQuerySchema.safeParse({ q: 'coffee', status: 'refunded' });
    expect(result.success).toBe(false);
  });
});
