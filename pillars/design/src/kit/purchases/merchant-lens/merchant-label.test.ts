import { describe, expect, it } from 'vitest';

import { merchantLabel } from './merchant-label';

import type { MerchantIdentity } from '@/fixtures/purchases-merchant-spend';

describe('merchantLabel', () => {
  it('shows an entity by its name', () => {
    const identity: MerchantIdentity = { resolution: 'entity', entityId: 'e1', name: 'Bunnings' };
    expect(merchantLabel(identity)).toBe('Bunnings');
  });

  it('falls back to the entity id when an entity carries no name, rather than showing nothing', () => {
    const identity: MerchantIdentity = { resolution: 'entity', entityId: 'e1', name: null };
    expect(merchantLabel(identity)).toBe('Unnamed merchant (e1)');
  });

  it('shows a name-grouped merchant by its label', () => {
    const identity: MerchantIdentity = {
      resolution: 'name',
      entityId: null,
      name: 'Woolies Metro',
    };
    expect(merchantLabel(identity)).toBe('Woolies Metro');
  });

  it('names the unattributed group distinctly from an unnamed entity', () => {
    const identity: MerchantIdentity = { resolution: 'unattributed', entityId: null, name: null };
    expect(merchantLabel(identity)).toBe('No merchant named');
  });
});
