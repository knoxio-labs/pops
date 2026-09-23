import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callOk, mockPillarInventory, parseResult, pillarMockGetter } from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { itemTools } = await import('./inventory-items.js');

const ITEM_ID = '20000000-0000-4000-8000-000000000001';
const FIELD_ID = '40000000-0000-4000-8000-000000000001';
const MUTATION_ID = '30000000-0000-4000-8000-000000000001';

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
        { mutationId: MUTATION_ID, status: 'applied', revision: 4, seq: 10, converged: false },
      ],
      highWaterSeq: 10,
    })
  );
});

describe('computed-field overrides', () => {
  it('sends item.setOverride with one value, the observed revision and the catalogue pin', async () => {
    const result = await tool('inventory.items.setOverride').handler({
      id: ITEM_ID,
      revision: 3,
      catalogueRevision: 2,
      fieldId: FIELD_ID,
      value: { amount: '6', unit: 'l' },
      mutationId: MUTATION_ID,
    });

    expect(inventory.sync.mutations).toHaveBeenLastCalledWith({
      mutations: [
        expect.objectContaining({
          mutationId: MUTATION_ID,
          op: 'item.setOverride',
          entityId: ITEM_ID,
          baseRevision: 3,
          catalogueRevision: 2,
          args: { fieldId: FIELD_ID, values: [{ amount: '6', unit: 'l' }] },
        }),
      ],
    });
    expect(parseResult(result)).toMatchObject({ itemId: ITEM_ID, outcome: { status: 'applied' } });
  });

  it('sends item.clearOverride with only the field', async () => {
    await tool('inventory.items.clearOverride').handler({
      id: ITEM_ID,
      revision: 4,
      catalogueRevision: 2,
      fieldId: FIELD_ID,
    });

    expect(inventory.sync.mutations).toHaveBeenLastCalledWith({
      mutations: [
        expect.objectContaining({
          op: 'item.clearOverride',
          baseRevision: 4,
          args: { fieldId: FIELD_ID },
        }),
      ],
    });
  });

  it('refuses an override without a value before calling inventory', async () => {
    const result = await tool('inventory.items.setOverride').handler({
      id: ITEM_ID,
      revision: 3,
      catalogueRevision: 2,
      fieldId: FIELD_ID,
    });

    expect(result.isError).toBe(true);
    expect(inventory.sync.mutations).not.toHaveBeenCalled();
  });

  it('refuses a field that is not a stable ID', async () => {
    const result = await tool('inventory.items.clearOverride').handler({
      id: ITEM_ID,
      revision: 3,
      catalogueRevision: 2,
      fieldId: 'volume',
    });

    expect(result.isError).toBe(true);
    expect(inventory.sync.mutations).not.toHaveBeenCalled();
  });

  it('reports a refused override as a tool error with the server reason', async () => {
    inventory.sync.mutations.mockResolvedValueOnce(
      callOk({
        outcomes: [
          {
            mutationId: MUTATION_ID,
            status: 'rejected',
            reason: 'invalid',
            message: 'field does not permit an override',
          },
        ],
        highWaterSeq: 10,
      })
    );

    const result = await tool('inventory.items.setOverride').handler({
      id: ITEM_ID,
      revision: 3,
      catalogueRevision: 2,
      fieldId: FIELD_ID,
      value: true,
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('does not permit an override');
  });
});

describe('computed values on item reads', () => {
  it('returns every computed state unchanged', async () => {
    const computedValues = [
      {
        fieldId: FIELD_ID,
        source: 'computed',
        catalogueRevision: 2,
        state: 'ok',
        values: [8],
        dependencies: [{ itemId: ITEM_ID, fieldId: FIELD_ID, revision: 3 }],
        traversedItemIds: [ITEM_ID],
      },
      {
        fieldId: FIELD_ID,
        source: 'computed',
        catalogueRevision: 2,
        state: 'overridden',
        values: [9],
        override: { catalogueRevision: 2 },
        dependencies: [],
        traversedItemIds: [],
      },
      {
        fieldId: FIELD_ID,
        source: 'computed',
        catalogueRevision: 2,
        state: 'unavailable',
        reason: 'missing_dependency',
        failedFieldId: FIELD_ID,
        dependencies: [],
        traversedItemIds: [ITEM_ID],
      },
    ];
    const item = { id: ITEM_ID, revision: 3, fieldValues: [], computedValues };
    inventory.web.get.mockResolvedValueOnce(
      callOk({ item, history: { events: [], nextCursor: null } })
    );

    const result = await tool('inventory.items.get').handler({ id: ITEM_ID });

    expect(parseResult(result)).toEqual({ item, history: { events: [], nextCursor: null } });
  });
});
