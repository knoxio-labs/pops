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
