/**
 * The merchant filter's own vocabulary, held to the roll-up's.
 *
 * A group the roll-up can emit and the filter cannot name is a merchant row
 * that opens nothing, and the compiler will not say so: both sides are
 * closed unions over the same three-word vocabulary, and it is the *pairing*
 * that has to hold, not either alone.
 */
import { describe, expect, it } from 'vitest';

import { MERCHANT_RESOLUTIONS } from '../constants.js';
import { resolveMerchantFilter } from '../merchant-filter.js';

import type { MerchantFilterQuery } from '../merchant-filter.js';

function merchantOf(query: MerchantFilterQuery) {
  const resolved = resolveMerchantFilter(query);
  if (!resolved.ok) throw new Error(`expected a filter, got a conflict: ${resolved.conflicting}`);
  return resolved.merchant;
}

describe('resolveMerchantFilter', () => {
  it('names every resolution the roll-up groups by', () => {
    const named = [
      merchantOf({ merchantEntityId: 'ent-1' }),
      merchantOf({ merchantEntityName: 'Woolworths' }),
      merchantOf({ merchantUnattributed: true }),
    ].map((filter) => filter?.resolution);

    expect([...named].sort()).toEqual([...MERCHANT_RESOLUTIONS].sort());
  });

  it('scopes to no merchant when nothing was sent', () => {
    expect(merchantOf({})).toBeUndefined();
  });

  it('treats an unengaged unattributed flag as no filter', () => {
    expect(merchantOf({ merchantUnattributed: false })).toBeUndefined();
    expect(merchantOf({ merchantUnattributed: false, merchantEntityId: 'ent-1' })).toEqual({
      resolution: 'entity',
      entityId: 'ent-1',
    });
  });

  it.each([
    { query: { merchantEntityId: 'e', merchantEntityName: 'n' }, conflicting: 2 },
    { query: { merchantEntityId: 'e', merchantUnattributed: true }, conflicting: 2 },
    { query: { merchantEntityName: 'n', merchantUnattributed: true }, conflicting: 2 },
    {
      query: { merchantEntityId: 'e', merchantEntityName: 'n', merchantUnattributed: true },
      conflicting: 3,
    },
  ])(
    'refuses $conflicting engaged parameters rather than picking one',
    ({ query, conflicting }) => {
      const resolved = resolveMerchantFilter(query);

      expect(resolved.ok).toBe(false);
      if (resolved.ok) throw new Error('expected a conflict');
      expect(resolved.conflicting).toHaveLength(conflicting);
    }
  );

  it('names the parameters that fought, so the message quotes what was sent', () => {
    const resolved = resolveMerchantFilter({ merchantEntityId: 'e', merchantUnattributed: true });

    expect(resolved.ok).toBe(false);
    if (resolved.ok) throw new Error('expected a conflict');
    expect(resolved.conflicting).toEqual(['merchantEntityId', 'merchantUnattributed']);
  });

  it('keeps a label verbatim, because the roll-up keys the group on it', () => {
    expect(merchantOf({ merchantEntityName: '  Woolworths Metro ' })).toEqual({
      resolution: 'name',
      name: '  Woolworths Metro ',
    });
  });
});
