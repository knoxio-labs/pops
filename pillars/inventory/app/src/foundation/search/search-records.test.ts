import { Receipt, ShoppingBag } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { INVENTORY_ICONS } from '../model/icons';
import { coreWorld } from '../test-fixtures/core';
import { kitchen12 } from '../test-fixtures/core-containers';
import { drill, hdmiCables } from '../test-fixtures/core-items';
import { coreLocations } from '../test-fixtures/core-locations';
import {
  itemRecord,
  parseRecordId,
  placeRecord,
  purchaseDateText,
  purchaseRecord,
  recentRecordEntries,
  recordHref,
  recordId,
  trailText,
} from './search-records';

import type { PurchaseHit } from '../../inventory-web/purchase-model';

function purchase(overrides: Partial<PurchaseHit> = {}): PurchaseHit {
  return {
    id: 'purchase-1',
    merchant: 'Kmart',
    orderNumber: 'KM-123',
    date: '2026-09-12T12:00:00.000Z',
    totalCents: 1400,
    currency: 'AUD',
    matchedLine: 'Cable organiser, 3 pack',
    ...overrides,
  };
}

describe('itemRecord', () => {
  it('carries the code and the trail without the house', () => {
    expect(itemRecord(drill, coreWorld, 'records')).toMatchObject({
      id: 'item:itm-drill',
      label: 'Cordless drill',
      group: 'records',
      icon: INVENTORY_ICONS.item,
      keywords: ['D01', 'Tools'],
      detail: 'D01 · Garage › Workbench',
    });
    expect(trailText(coreWorld, drill.placement)).toBe('Garage › Workbench');
  });

  it('uses the container icon for container records', () => {
    expect(itemRecord(kitchen12, coreWorld, 'recents').icon).toBe(INVENTORY_ICONS.container);
  });
});

describe('placeRecord', () => {
  it('says Place and its parents without the house', () => {
    const place = coreLocations.find((location) => location.id === 'loc-workbench');
    if (place === undefined) throw new Error('Missing workbench fixture');
    expect(placeRecord(place, coreWorld, 'records')).toMatchObject({
      id: 'place:loc-workbench',
      label: 'Workbench',
      group: 'records',
      detail: 'Place · Garage',
    });
  });
});

describe('purchaseRecord', () => {
  it('names the matched line with a shopping icon and the UTC date', () => {
    const entry = purchaseRecord(purchase());
    expect(entry).toMatchObject({
      id: 'purchase:purchase-1',
      label: 'Cable organiser, 3 pack',
      group: 'records',
      icon: ShoppingBag,
      detail: 'Kmart · 12 Sept 2026 · $14.00',
    });
  });

  it('names an order without inventing a line count', () => {
    const entry = purchaseRecord(
      purchase({
        id: 'purchase-2',
        merchant: 'Amazon',
        orderNumber: '114-2231',
        totalCents: 8640,
        matchedLine: null,
      })
    );
    expect(entry).toMatchObject({
      label: 'Order 114-2231',
      icon: Receipt,
      detail: 'Amazon · 12 Sept 2026 · $86.40',
    });
    expect(entry.detail).not.toContain('items');
  });

  it('falls back to the merchant when neither line nor order number is present', () => {
    expect(
      purchaseRecord(purchase({ merchant: 'Officeworks', orderNumber: null, matchedLine: null }))
    ).toMatchObject({ label: 'Officeworks', icon: Receipt });
  });
});

describe('purchaseDateText', () => {
  it('prints the UTC day regardless of the host time zone', () => {
    const previous = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(purchaseDateText('2026-09-12T20:00:00.000Z')).toBe('12 Sept 2026');
      process.env.TZ = 'Australia/Sydney';
      expect(purchaseDateText('2026-09-12T20:00:00.000Z')).toBe('12 Sept 2026');
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});

describe('record ids and hrefs', () => {
  it('round-trips known kinds and rejects empty or unknown entries', () => {
    expect(recordId('item', 'item-1')).toBe('item:item-1');
    expect(parseRecordId('item:item-1')).toEqual({ kind: 'item', id: 'item-1' });
    expect(parseRecordId('purchase:order:1')).toEqual({ kind: 'purchase', id: 'order:1' });
    expect(parseRecordId('unknown:thing')).toBeNull();
    expect(parseRecordId('item:')).toBeNull();
    expect(parseRecordId('missing-separator')).toBeNull();
  });

  it('sends items, places and purchases to their pages and rejects anything else', () => {
    expect(recordHref('item:item-1')).toBe('/inventory/items/item-1');
    expect(recordHref('place:location-1')).toBe('/inventory/locations/location-1');
    expect(recordHref('purchase:purchase-1')).toBe('/purchases/purchase-1');
    expect(recordHref('command:search')).toBeNull();
    expect(recordHref('item:')).toBeNull();
  });
});

describe('recentRecordEntries', () => {
  it('resolves items and places in order and drops unknown records', () => {
    const entries = recentRecordEntries(
      [
        { kind: 'item', id: hdmiCables.id },
        { kind: 'location', id: 'loc-garage' },
        { kind: 'item', id: 'missing-item' },
        { kind: 'location', id: 'missing-place' },
      ],
      coreWorld
    );

    expect(entries.map((entry) => entry.id)).toEqual(['item:itm-hdmi', 'place:loc-garage']);
    expect(entries.every((entry) => entry.group === 'recents')).toBe(true);
  });
});
