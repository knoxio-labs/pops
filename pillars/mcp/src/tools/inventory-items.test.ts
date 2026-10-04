import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callOk,
  callUnavailable,
  mockPillarInventory,
  parseResult,
  pillarMockGetter,
} from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { itemTools } = await import('./inventory-items.js');

const TYPE_ID = '10000000-0000-5000-8000-000000000001';
const ITEM_ID = '20000000-0000-4000-8000-000000000001';
const MUTATION_ID = '30000000-0000-4000-8000-000000000001';
const FIELD_IDS = Array.from(
  { length: 11 },
  (_, index) => `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
);
const EVERY_PRIMITIVE = [
  { fieldId: FIELD_IDS[0], values: ['short'] },
  { fieldId: FIELD_IDS[1], values: ['first', 'second'] },
  { fieldId: FIELD_IDS[2], values: [42] },
  { fieldId: FIELD_IDS[3], values: ['12.340'] },
  { fieldId: FIELD_IDS[4], values: [false] },
  { fieldId: FIELD_IDS[5], values: [{ optionId: '50000000-0000-4000-8000-000000000001' }] },
  { fieldId: FIELD_IDS[6], values: [{ amount: '1.500', unit: 'kg' }] },
  { fieldId: FIELD_IDS[7], values: ['2026-09-23'] },
  { fieldId: FIELD_IDS[8], values: ['2026-09-23T01:02:03.004Z'] },
  { fieldId: FIELD_IDS[9], values: ['https://example.com/item'] },
  {
    fieldId: FIELD_IDS[10],
    values: [{ targetKind: 'item', targetId: '60000000-0000-4000-8000-000000000001' }],
  },
];

function tool(name: string) {
  const found = itemTools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Tool not found: ${name}`);
  return found;
}

const inventory = mockPillarInventory.inventory;

beforeEach(() => {
  vi.clearAllMocks();
  inventory.sync.mutations.mockResolvedValue(
    callOk({
      outcomes: [
        { mutationId: MUTATION_ID, status: 'applied', revision: 2, seq: 10, converged: false },
      ],
      highWaterSeq: 10,
    })
  );
});

describe('protocol-2 inventory reads', () => {
  it('lists generic items through the cursor-paged web surface', async () => {
    await tool('inventory.items.list').handler({
      cursor: 'next',
      limit: 10,
      typeKey: 'dynamic',
      placementKind: 'container',
      containingItemId: 'container-1',
      includeInactive: true,
    });

    expect(inventory.web.list).toHaveBeenCalledWith({
      cursor: 'next',
      limit: 10,
      typeKey: 'dynamic',
      placementKind: 'container',
      locationId: undefined,
      containingItemId: 'container-1',
      includeInactive: true,
    });
  });

  it('returns stable IDs and structured field values unchanged', async () => {
    const item = {
      id: ITEM_ID,
      revision: 7,
      typeId: TYPE_ID,
      catalogueRevision: 2,
      fieldValues: [
        {
          fieldId: FIELD_IDS[10],
          source: 'stored',
          catalogueRevision: 2,
          values: [
            {
              targetKind: 'item',
              targetId: '60000000-0000-4000-8000-000000000001',
              targetState: 'resolved',
            },
          ],
        },
      ],
    };
    inventory.web.get.mockResolvedValueOnce(
      callOk({ item, history: { events: [], nextCursor: null } })
    );

    const result = await tool('inventory.items.get').handler({ id: ITEM_ID, historyLimit: 25 });

    expect(inventory.web.get).toHaveBeenCalledWith({
      id: ITEM_ID,
      historyCursor: undefined,
      historyLimit: 25,
    });
    expect(parseResult(result)).toEqual({ item, history: { events: [], nextCursor: null } });
  });
});

describe('protocol-2 inventory writes', () => {
  it('preserves every primitive, multi-values, references and retry identity on create', async () => {
    const input = {
      itemName: 'Dynamic item',
      entityId: ITEM_ID,
      mutationId: MUTATION_ID,
      catalogueRevision: 2,
      typeId: TYPE_ID,
      fieldValues: EVERY_PRIMITIVE,
      note: null,
    };

    await tool('inventory.items.create').handler(input);
    await tool('inventory.items.create').handler(input);

    expect(inventory.sync.mutations).toHaveBeenCalledTimes(2);
    for (const call of inventory.sync.mutations.mock.calls) {
      expect(call[0]).toEqual({
        mutations: [
          {
            mutationId: MUTATION_ID,
            op: 'item.create',
            entityId: ITEM_ID,
            baseRevision: null,
            catalogueRevision: 2,
            dependsOn: [],
            clientTime: expect.any(String),
            args: {
              item: {
                name: 'Dynamic item',
                typeId: TYPE_ID,
                values: EVERY_PRIMITIVE,
                note: null,
              },
            },
          },
        ],
      });
    }
  });

  it('derives a retry-stable entity identity when only mutationId is supplied', async () => {
    const input = {
      itemName: 'Retryable item',
      mutationId: MUTATION_ID,
      catalogueRevision: 2,
      typeId: TYPE_ID,
      fieldValues: [],
    };

    await tool('inventory.items.create').handler(input);
    await tool('inventory.items.create').handler(input);

    for (const call of inventory.sync.mutations.mock.calls) {
      expect(call[0].mutations[0]).toMatchObject({
        mutationId: MUTATION_ID,
        entityId: MUTATION_ID,
      });
    }
  });

  it('forwards a computed-field override source on create', async () => {
    const fieldValues = [
      { fieldId: FIELD_IDS[0], values: ['short'] },
      { fieldId: FIELD_IDS[1], source: 'stored', values: [3] },
      { fieldId: FIELD_IDS[2], source: 'override', values: [9] },
    ];

    await tool('inventory.items.create').handler({
      itemName: 'Irregular box',
      mutationId: MUTATION_ID,
      catalogueRevision: 2,
      typeId: TYPE_ID,
      fieldValues,
    });

    expect(inventory.sync.mutations.mock.calls[0]?.[0].mutations[0]).toMatchObject({
      op: 'item.create',
      args: { item: { values: fieldValues } },
    });
  });

  it('refuses a create field-value source other than stored or override', async () => {
    const result = await tool('inventory.items.create').handler({
      itemName: 'Irregular box',
      catalogueRevision: 2,
      typeId: TYPE_ID,
      fieldValues: [{ fieldId: FIELD_IDS[2], source: 'computed', values: [9] }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: 'text', text: 'Invalid fieldValues[0].source' });
    expect(inventory.sync.mutations).not.toHaveBeenCalled();
  });

  it('patches stable values and preserves null as an explicit clear', async () => {
    await tool('inventory.items.update').handler({
      id: ITEM_ID,
      revision: 7,
      catalogueRevision: 2,
      mutationId: MUTATION_ID,
      note: null,
      fieldValues: [{ fieldId: FIELD_IDS[0], values: null }],
    });

    const envelope = inventory.sync.mutations.mock.calls[0]?.[0].mutations[0];
    expect(envelope).toMatchObject({
      mutationId: MUTATION_ID,
      op: 'item.edit',
      entityId: ITEM_ID,
      baseRevision: 7,
      catalogueRevision: 2,
      args: { note: null, values: [{ fieldId: FIELD_IDS[0], values: null }] },
    });
  });

  it('replaces external identifiers and omits them when absent', async () => {
    await tool('inventory.items.update').handler({
      id: ITEM_ID,
      revision: 7,
      catalogueRevision: 2,
      itemName: 'With ISBN',
      externalIds: [
        { kind: 'isbn13', value: '9780306406157' },
        { kind: 'serial', value: 'ABC-123' },
      ],
    });

    expect(inventory.sync.mutations.mock.calls[0]?.[0].mutations[0]).toMatchObject({
      args: {
        name: 'With ISBN',
        externalIds: [
          { kind: 'isbn13', value: '9780306406157' },
          { kind: 'serial', value: 'ABC-123' },
        ],
      },
    });

    await tool('inventory.items.update').handler({
      id: ITEM_ID,
      revision: 7,
      catalogueRevision: 2,
      itemName: 'Without external IDs',
    });

    expect(inventory.sync.mutations.mock.calls[1]?.[0].mutations[0].args).not.toHaveProperty(
      'externalIds'
    );
  });

  it('forwards an empty external-identifier list to clear it', async () => {
    await tool('inventory.items.update').handler({
      id: ITEM_ID,
      revision: 7,
      catalogueRevision: 2,
      externalIds: [],
    });

    expect(inventory.sync.mutations.mock.calls[0]?.[0].mutations[0]).toMatchObject({
      args: { externalIds: [] },
    });
  });

  it.each([
    ['not an array', { externalIds: 'isbn13' }, 'externalIds must be an array'],
    [
      'missing kind',
      { externalIds: [{ kind: 'isbn13', value: '9780306406157' }, { value: 'ABC-123' }] },
      'externalIds[1].kind must be a non-empty string',
    ],
    [
      'empty value',
      { externalIds: [{ kind: 'isbn13', value: '' }] },
      'externalIds[0].value must be a non-empty string',
    ],
    [
      'extra property',
      { externalIds: [{ kind: 'isbn13', value: '9780306406157', source: 'scan' }] },
      'externalIds[0].source is not allowed',
    ],
  ])('rejects invalid external identifiers: %s', async (_case, input, error) => {
    const result = await tool('inventory.items.update').handler({
      id: ITEM_ID,
      revision: 7,
      catalogueRevision: 2,
      itemName: 'Invalid external ID',
      ...input,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: 'text', text: error });
    expect(inventory.sync.mutations).not.toHaveBeenCalled();
  });

  it('accepts an update containing only external identifiers', async () => {
    await tool('inventory.items.update').handler({
      id: ITEM_ID,
      revision: 7,
      catalogueRevision: 2,
      externalIds: [{ kind: 'isbn13', value: '9780306406157' }],
    });

    expect(inventory.sync.mutations.mock.calls[0]?.[0].mutations[0].args).toEqual({
      externalIds: [{ kind: 'isbn13', value: '9780306406157' }],
    });
  });

  it('forwards provenance on create as the legacy purchase columns', async () => {
    await tool('inventory.items.create').handler({
      itemName: 'Bookends',
      catalogueRevision: 1,
      typeId: TYPE_ID,
      fieldValues: [],
      provenance: {
        merchant: 'Amazon',
        price: 39.95,
        purchasedOn: '2026-09-20',
        warrantyExpires: '2027-09-20',
        transactionUri: 'pops://finance/transaction/txn-1',
      },
    });

    expect(inventory.sync.mutations.mock.calls[0]?.[0].mutations[0]).toMatchObject({
      op: 'item.create',
      args: {
        legacy: {
          purchasedFromName: 'Amazon',
          purchasePrice: 39.95,
          purchaseDate: '2026-09-20',
          warrantyExpires: '2027-09-20',
          purchaseTransactionId: 'txn-1',
        },
      },
    });
  });

  it('sends no legacy patch on create or update when provenance is absent', async () => {
    await tool('inventory.items.create').handler({
      itemName: 'Found on the street',
      catalogueRevision: 1,
      typeId: TYPE_ID,
      fieldValues: [],
    });
    await tool('inventory.items.update').handler({
      id: ITEM_ID,
      revision: 7,
      catalogueRevision: 2,
      itemName: 'Renamed',
    });

    for (const call of inventory.sync.mutations.mock.calls) {
      expect(call[0].mutations[0].args).not.toHaveProperty('legacy');
    }
  });

  it('accepts an update carrying only provenance and patches just the named facts', async () => {
    await tool('inventory.items.update').handler({
      id: ITEM_ID,
      revision: 7,
      catalogueRevision: 2,
      provenance: { transactionUri: 'pops://finance/transaction/txn-2', price: null },
    });

    expect(inventory.sync.mutations.mock.calls[0]?.[0].mutations[0]).toMatchObject({
      op: 'item.edit',
      baseRevision: 7,
    });
    expect(inventory.sync.mutations.mock.calls[0]?.[0].mutations[0].args).toEqual({
      legacy: { purchaseTransactionId: 'txn-2', purchasePrice: null },
    });
  });

  it('clears every purchase fact when an update sends provenance null', async () => {
    await tool('inventory.items.update').handler({
      id: ITEM_ID,
      revision: 7,
      catalogueRevision: 2,
      provenance: null,
    });

    expect(inventory.sync.mutations.mock.calls[0]?.[0].mutations[0].args).toEqual({
      legacy: {
        purchasedFromName: null,
        purchasePrice: null,
        purchaseDate: null,
        warrantyExpires: null,
        purchaseTransactionId: null,
      },
    });
  });

  it.each([
    ['not an object', 'txn-1', 'provenance must be an object or null'],
    ['an array', [], 'provenance must be an object or null'],
    ['no facts', {}, 'provenance must set at least one of'],
    [
      'a transaction URI with no id',
      { transactionUri: 'pops://finance/transaction/' },
      'provenance.transactionUri is missing its transaction id',
    ],
    [
      'a bare transaction id',
      { transactionUri: 'txn-1' },
      'provenance.transactionUri must be pops://finance/transaction/<id> or null',
    ],
    [
      "another pillar's URI",
      { transactionUri: 'pops://purchases/order/f2fe4fac' },
      'provenance.transactionUri must be pops://finance/transaction/<id> or null',
    ],
    [
      'a nested transaction path',
      { transactionUri: 'pops://finance/transaction/a/b' },
      'provenance.transactionUri is missing its transaction id',
    ],
    ['an empty merchant', { merchant: '' }, 'provenance.merchant must be a non-empty string'],
    ['a text price', { price: '39.95' }, 'provenance.price must be a non-negative number'],
    ['a negative price', { price: -1 }, 'provenance.price must be a non-negative number'],
    ['a numeric date', { purchasedOn: 20260920 }, 'provenance.purchasedOn must be a non-empty'],
    ['an unknown key', { orderId: 'f2fe4fac' }, 'provenance.orderId is not allowed'],
  ])('rejects malformed provenance on update: %s', async (_case, provenance, error) => {
    const result = await tool('inventory.items.update').handler({
      id: ITEM_ID,
      revision: 7,
      catalogueRevision: 2,
      itemName: 'Still valid on its own',
      provenance,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect(JSON.stringify(result.content[0])).toContain(error);
    expect(inventory.sync.mutations).not.toHaveBeenCalled();
  });

  it.each([
    ['null, which a create has nothing to clear', null, 'provenance must be an object'],
    [
      'a missing transaction id',
      { merchant: 'Amazon', transactionUri: 'pops://finance/transaction/' },
      'provenance.transactionUri is missing its transaction id',
    ],
  ])('rejects malformed provenance on create: %s', async (_case, provenance, error) => {
    const result = await tool('inventory.items.create').handler({
      itemName: 'Bookends',
      catalogueRevision: 1,
      typeId: TYPE_ID,
      fieldValues: [],
      provenance,
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content[0])).toContain(error);
    expect(inventory.sync.mutations).not.toHaveBeenCalled();
  });

  it('rejects an update with no changes using the complete error', async () => {
    const result = await tool('inventory.items.update').handler({
      id: ITEM_ID,
      revision: 7,
      catalogueRevision: 2,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'At least one of itemName, note, fieldValues, externalIds, or provenance is required',
    });
    expect(inventory.sync.mutations).not.toHaveBeenCalled();
  });

  it('changes type with a complete replacement value set', async () => {
    await tool('inventory.items.changeType').handler({
      id: ITEM_ID,
      revision: 7,
      catalogueRevision: 2,
      typeId: TYPE_ID,
      fieldValues: EVERY_PRIMITIVE,
    });

    expect(inventory.sync.mutations.mock.calls[0]?.[0].mutations[0]).toMatchObject({
      op: 'item.changeType',
      entityId: ITEM_ID,
      baseRevision: 7,
      catalogueRevision: 2,
      args: { typeId: TYPE_ID, values: EVERY_PRIMITIVE },
    });
  });

  it('deletes at the caller-observed revision with a retry-stable identity', async () => {
    await tool('inventory.items.delete').handler({
      id: ITEM_ID,
      revision: 7,
      mutationId: MUTATION_ID,
    });

    expect(inventory.sync.mutations.mock.calls[0]?.[0].mutations[0]).toMatchObject({
      mutationId: MUTATION_ID,
      op: 'item.delete',
      entityId: ITEM_ID,
      baseRevision: 7,
      args: {},
    });
  });

  it.each([
    ['field', 'stale item revision'],
    ['enum_option_archived', 'retired enum option'],
    ['target_missing', 'missing reference'],
    ['reference_type_mismatch', 'retired reference target'],
    ['catalogue_changed', 'published catalogue changed'],
    ['migration_required', 'migration is required'],
    ['repair_required', 'item requires repair'],
    ['client_too_old', 'protocol update required'],
  ])('surfaces %s outcomes as actionable tool failures', async (reason, message) => {
    inventory.sync.mutations.mockResolvedValueOnce(
      callOk({
        outcomes: [{ mutationId: MUTATION_ID, status: 'rejected', reason, message }],
        highWaterSeq: 10,
      })
    );

    const result = await tool('inventory.items.update').handler({
      id: ITEM_ID,
      revision: 6,
      catalogueRevision: 2,
      itemName: 'Edited',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify({
        itemId: ITEM_ID,
        outcome: { mutationId: MUTATION_ID, status: 'rejected', reason, message },
      }),
    });
  });

  it('surfaces unavailable inventory without attempting a fallback write', async () => {
    inventory.sync.mutations.mockResolvedValueOnce(callUnavailable('inventory'));
    const result = await tool('inventory.items.create').handler({
      itemName: 'Unavailable',
      catalogueRevision: 2,
      typeId: TYPE_ID,
      fieldValues: [],
    });
    expect(result.isError).toBe(true);
    expect(inventory.items.create).not.toHaveBeenCalled();
  });
});
