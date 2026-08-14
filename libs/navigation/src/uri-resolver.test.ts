import { describe, expect, it } from 'vitest';

import { resolveUri } from './uri-resolver';

describe('resolveUri', () => {
  describe('media URIs', () => {
    it('resolves movie URI', () => {
      expect(resolveUri('pops:media/movie/42')).toBe('/media/movies/42');
    });

    it('resolves tv-show URI', () => {
      expect(resolveUri('pops:media/tv-show/7')).toBe('/media/tv/7');
    });
  });

  describe('finance URIs', () => {
    it('resolves transaction URI', () => {
      expect(resolveUri('pops:finance/transaction/123')).toBe('/finance/transactions/123');
    });

    it('still resolves the legacy entity URI during the rolling deploy', () => {
      // Core keeps emitting `finance/entity` from its search adapter until the
      // Stage 4a core-entities removal; the mapping must keep working so a hit
      // from an un-rolled core never dead-ends.
      expect(resolveUri('pops:finance/entity/5')).toBe('/finance/entities/5');
    });

    it('resolves budget URI', () => {
      expect(resolveUri('pops:finance/budget/8')).toBe('/finance/budgets/8');
    });
  });

  describe('contacts URIs', () => {
    it('resolves the canonical contact URI to /contacts', () => {
      expect(resolveUri('pops:contacts/contact/abc')).toBe('/contacts/abc');
    });
  });

  describe('purchases URIs', () => {
    it('resolves an order URI to the detail route the app mounts', () => {
      expect(resolveUri('pops:purchases/purchase/abc')).toBe('/purchases/abc');
    });

    // ADR-012 keeps the id segment one row's primary key, so a line cannot
    // carry its order's id in the URI. Its route comes from the hit's data,
    // where the pillar's item adapter already puts the order id.
    it('opens a line at the order its hit data names', () => {
      expect(resolveUri('pops:purchases/purchase-item/line-1', { purchaseId: 'order-7' })).toBe(
        '/purchases/order-7?item=line-1'
      );
    });

    it('refuses a line whose hit carries no order id', () => {
      expect(resolveUri('pops:purchases/purchase-item/line-1')).toBeNull();
      expect(resolveUri('pops:purchases/purchase-item/line-1', {})).toBeNull();
      expect(resolveUri('pops:purchases/purchase-item/line-1', { purchaseId: '' })).toBeNull();
      expect(resolveUri('pops:purchases/purchase-item/line-1', { purchaseId: 42 })).toBeNull();
    });

    it('ignores hit data for a type addressed by its own id', () => {
      expect(resolveUri('pops:purchases/purchase/abc', { purchaseId: 'somewhere-else' })).toBe(
        '/purchases/abc'
      );
    });
  });

  describe('inventory URIs', () => {
    it('resolves item URI', () => {
      expect(resolveUri('pops:inventory/item/99')).toBe('/inventory/items/99');
    });
  });

  describe('malformed URIs', () => {
    it('returns null for non-pops URI', () => {
      expect(resolveUri('https://example.com')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(resolveUri('')).toBeNull();
    });

    it('returns null for unknown domain/type', () => {
      expect(resolveUri('pops:unknown/thing/1')).toBeNull();
    });

    it('returns null for missing ID', () => {
      expect(resolveUri('pops:media/movie/')).toBeNull();
    });

    it('returns null for URI with no slashes after prefix', () => {
      expect(resolveUri('pops:media')).toBeNull();
    });

    it('returns null for pops: with no content', () => {
      expect(resolveUri('pops:')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles string IDs', () => {
      expect(resolveUri('pops:finance/entity/abc')).toBe('/finance/entities/abc');
    });
  });
});
