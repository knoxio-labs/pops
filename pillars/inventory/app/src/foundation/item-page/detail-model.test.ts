import { describe, expect, it } from 'vitest';

import { buildDetailFacts, buildDetailSectionSummaries } from './detail-model';

import type { LegacyItem } from './detail-types';

const item: LegacyItem = {
  id: 'item-1',
  itemName: 'Desk lamp',
  brand: 'Anglepoise',
  model: 'Type 75',
  type: 'Lighting',
  condition: 'Good',
  room: 'Study',
  location: 'Desk',
  locationId: 'desk',
  assetId: 'LAMP-1',
  inUse: true,
  deductible: false,
  purchaseDate: '2026-02-14',
  purchasePrice: 120,
  replacementValue: 180,
  resaleValue: null,
  warrantyExpires: null,
  purchaseTransactionId: null,
  purchasedFromId: null,
  purchasedFromName: null,
  itemId: null,
  containerId: null,
  notes: null,
  lastEditedTime: '2026-02-14T00:00:00Z',
};

describe('item detail aggregate mapping', () => {
  it('maps legacy fields to ordered, display-ready facts and omits null fields', () => {
    const facts = buildDetailFacts(item);

    expect(facts.map((fact) => fact.label)).toEqual([
      'Type',
      'Condition',
      'Brand',
      'Model',
      'Room',
      'Location',
      'Asset ID',
      'Status',
      'Purchased',
      'Purchase price',
      'Replacement value',
      'Deductible',
    ]);
    expect(facts.find((fact) => fact.key === 'purchasePrice')?.value).toBe('$120');
    expect(facts.some((fact) => fact.key === 'resaleValue')).toBe(false);
  });

  it('maps section counts and marks Paperless outage as actionable', () => {
    const sections = buildDetailSectionSummaries({
      documentCount: 2,
      paperless: 'unreachable',
      connectionCount: 1,
      historyCount: 4,
      hasProvenance: true,
    });

    expect(sections.map((section) => section.id)).toEqual([
      'provenance',
      'documents',
      'connections',
      'history',
    ]);
    expect(sections.find((section) => section.id === 'documents')).toMatchObject({
      count: 2,
      flagged: true,
      summary: 'Paperless is unavailable',
    });
  });
});
