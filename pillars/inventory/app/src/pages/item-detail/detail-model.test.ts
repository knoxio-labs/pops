import { describe, expect, it } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model';
import {
  paperlessStateOf,
  parseDetailTab,
  relatedItemIds,
  toDetailConnections,
  toDetailDocuments,
  toDetailFacts,
  toDetailPhotos,
  toDetailProvenance,
} from './detail-model';

import type { CatalogueField, CatalogueType } from '../../catalogue-editor/types';
import type {
  ConnectionsGraphResponse,
  FixturesListForItemResponse,
  FixturesListResponse,
  WebGetResponse,
} from '../../inventory-api/types.gen.js';

function field(overrides: Partial<CatalogueField> = {}): CatalogueField {
  return {
    allowOverride: false,
    archivedAt: null,
    cardinality: 'one',
    defaultValues: [],
    enumOptions: [],
    expression: null,
    expressionVersion: null,
    fixedUnit: null,
    help: null,
    id: 'field-name',
    key: 'name',
    kind: 'short_text',
    label: 'Name',
    presentation: {},
    referenceKinds: [],
    referenceTypeIds: [],
    replacedBy: null,
    required: false,
    sortOrder: 0,
    storage: 'stored',
    typeId: 'type-1',
    ...overrides,
  };
}

function type(fields: CatalogueField[]): CatalogueType {
  return {
    archivedAt: null,
    capabilities: [],
    description: null,
    fields,
    id: 'type-1',
    key: 'equipment',
    label: 'Equipment',
    legacyLabels: [],
    parentTypeId: null,
    presentation: {},
    replacedBy: null,
    revision: 1,
    sortOrder: 0,
  };
}

function webItem(overrides: Partial<WebGetResponse['item']> = {}): WebGetResponse['item'] {
  return {
    access: null,
    catalogueRevision: 1,
    code: 'EQ-1',
    computedValues: [],
    createdAt: '2026-09-01T00:00:00Z',
    deletedAt: null,
    documentTitles: [],
    documentsStatus: 'none',
    externalIds: [],
    fieldValues: [],
    fields: {},
    id: 'item-1',
    isContainer: false,
    isFull: null,
    legacyType: null,
    lifecycle: 'active',
    lifecycleChangedAt: null,
    name: 'Desk lamp',
    note: null,
    photos: [],
    placement: { kind: 'location', locationId: 'study' },
    previousPlacement: null,
    provenance: null,
    quantity: 1,
    revision: 1,
    seq: 1,
    typeId: 'type-1',
    typeKey: 'equipment',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

const relatedWorld = buildWorld(
  [
    {
      id: 'item-2',
      name: 'Spare cable',
      typeId: null,
      typeName: null,
      code: null,
      quantity: 1,
      container: null,
      lifecycle: 'active',
      placement: { kind: 'location', locationId: 'garage' },
      previous: null,
      sync: 'synced',
      photoUrl: null,
      note: null,
      updatedAt: '2026-09-01T00:00:00Z',
    },
  ],
  [
    { id: 'garage', name: 'Garage', parentId: null, kind: 'property' },
    { id: 'study', name: 'Study', parentId: null, kind: 'room' },
  ]
);

describe('item detail model', () => {
  it('defaults unknown URL tabs to overview', () => {
    expect(parseDetailTab(null)).toBe('overview');
    expect(parseDetailTab('facts')).toBe('facts');
    expect(parseDetailTab('unknown')).toBe('overview');
  });

  it('collects graph and field references once, excluding the subject and fixtures', () => {
    const graph: ConnectionsGraphResponse['data'] = {
      nodes: [
        { id: 'item-2', itemName: 'Spare cable', assetId: null, type: null },
        { id: 'fixture-1', itemName: 'Wall hook', assetId: null, type: 'hook', isFixture: true },
      ],
      edges: [
        { source: 'item-1', target: 'item-2' },
        { source: 'item-1', target: 'fixture-1' },
        { source: 'item-2', target: 'item-1' },
      ],
    };
    const item = webItem({
      fieldValues: [
        {
          catalogueRevision: 1,
          fieldId: 'field-ref',
          source: 'stored',
          values: [
            { targetKind: 'item', targetId: 'item-3' },
            { targetKind: 'item', targetId: 'item-1' },
          ],
        },
      ],
      computedValues: [
        {
          catalogueRevision: 1,
          dependencies: [],
          fieldId: 'computed-ref',
          source: 'computed',
          state: 'ok',
          traversedItemIds: [],
          values: [{ targetKind: 'item', targetId: 'item-2' }],
        },
      ],
    });
    expect(relatedItemIds('item-1', graph, item)).toEqual(['item-2', 'item-3']);
  });

  it('puts quantity first, sorts active fields, and records origins', () => {
    const stored = field({ id: 'stored-id', key: 'serial', label: 'Serial', sortOrder: 2 });
    const archived = field({
      id: 'archived-id',
      key: 'old',
      label: 'Old',
      sortOrder: 1,
      archivedAt: '2026-01-01',
    });
    const computed = field({
      id: 'computed-id',
      key: 'total',
      label: 'Total',
      sortOrder: 3,
      storage: 'computed',
    });
    const item = webItem({
      quantity: 3,
      fieldValues: [
        { catalogueRevision: 1, fieldId: 'stored-id', source: 'override', values: ['ABC'] },
      ],
      computedValues: [
        {
          catalogueRevision: 1,
          dependencies: [],
          fieldId: 'computed-id',
          source: 'computed',
          state: 'unavailable',
          failedFieldId: 'computed-id',
          missingInputs: [{ fieldId: 'stored-id', itemId: 'item-1', reason: 'missing' }],
          reason: 'missing',
          traversedItemIds: [],
        },
      ],
    });
    const facts = toDetailFacts(item, type([stored, archived, computed]), relatedWorld);
    expect(facts.map((fact) => fact.key)).toEqual(['quantity', 'serial', 'total']);
    expect(facts[1]).toMatchObject({ value: 'ABC', origin: 'overridden', inline: true });
    expect(facts[2]).toMatchObject({
      value: null,
      origin: 'missing-inputs',
      missingInputs: ['Serial'],
    });
  });

  it('maps provenance, linked documents, Paperless, and photo URLs', () => {
    const provenance = toDetailProvenance({
      merchant: 'Officeworks',
      price: 120.5,
      purchasedOn: '2026-02-14',
      transactionUri: 'pops:finance/transaction/42',
      warrantyExpires: '2027-02-14',
    });
    expect(provenance).toMatchObject({
      pricePaid: '$120.50',
      merchant: 'Officeworks',
      purchase: { href: '/finance/transactions/42' },
    });
    expect(
      toDetailDocuments([
        {
          createdAt: '2026-02-14T00:00:00Z',
          documentType: 'warranty',
          id: 7,
          itemId: 'item-1',
          missing: null,
          paperlessDocumentId: 99,
          title: null,
        },
        {
          createdAt: '2026-02-15T00:00:00Z',
          documentType: 'manual',
          id: 8,
          itemId: 'item-1',
          missing: true,
          paperlessDocumentId: 100,
          title: 'Desk lamp manual',
        },
      ])
    ).toEqual([
      {
        id: 7,
        title: 'Document #99',
        kind: 'Warranty',
        added: '14 Feb 2026',
        paperlessDocumentId: 99,
        missing: false,
      },
      {
        id: 8,
        title: 'Desk lamp manual',
        kind: 'Manual',
        added: '15 Feb 2026',
        paperlessDocumentId: 100,
        missing: true,
      },
    ]);
    expect(paperlessStateOf({ configured: true, available: false })).toBe('unreachable');
    expect(toDetailPhotos([{ sha256: 'abc', caption: 'Front' }])).toEqual([
      {
        id: 'abc',
        url: '/inventory-api/media/abc?variant=medium',
        thumbUrl: '/inventory-api/media/abc?variant=thumb',
        caption: 'Front',
      },
    ]);
  });

  it('maps item and fixture connections with placement context', () => {
    const graph: ConnectionsGraphResponse['data'] = {
      nodes: [{ id: 'item-2', itemName: 'Spare cable', assetId: null, type: null }],
      edges: [{ source: 'item-1', target: 'item-2' }],
    };
    const links: FixturesListForItemResponse['data'] = [
      { createdAt: '2026-09-01T00:00:00Z', fixtureId: 'fixture-1', id: 4, itemId: 'item-1' },
    ];
    const fixtures: FixturesListResponse['data'] = [
      {
        createdAt: '2026-09-01T00:00:00Z',
        id: 'fixture-1',
        lastEditedTime: '2026-09-01T00:00:00Z',
        locationId: 'garage',
        name: 'Wall hook',
        notes: null,
        type: 'hook',
        wiredCount: 0,
        wiredNames: [],
      },
    ];
    expect(toDetailConnections('item-1', graph, links, fixtures, relatedWorld)).toMatchObject([
      { id: 'item:item-2', target: 'item', name: 'Spare cable', relation: 'Connected to' },
      { id: 'fixture:4', target: 'fixture', name: 'Wall hook', where: 'Garage' },
    ]);
  });
});
