import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callOk, callUnavailable, mockPillarInventory, pillarMockGetter } from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { itemWriteTools } = await import('./inventory-items-write.js');
const ITEM_ID = '20000000-0000-4000-8000-000000000001';
const MUTATION_ID = '30000000-0000-4000-8000-000000000001';
const inventory = mockPillarInventory.inventory;
const update = { id: ITEM_ID, revision: 7, catalogueRevision: 2, mutationId: MUTATION_ID };
const create = {
  itemName: 'Book',
  entityId: ITEM_ID,
  mutationId: MUTATION_ID,
  catalogueRevision: 2,
  typeId: '10000000-0000-5000-8000-000000000001',
  fieldValues: [],
};

function tool(operation: 'create' | 'update') {
  const found = itemWriteTools.find(
    (candidate) => candidate.name === `inventory.items.${operation}`
  );
  if (!found) throw new Error(`Missing ${operation} tool`);
  return found;
}

function applied(revision: number) {
  return callOk({
    outcomes: [{ mutationId: MUTATION_ID, status: 'applied', revision, seq: 10, converged: false }],
    highWaterSeq: 10,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  inventory.sync.mutations.mockResolvedValue(applied(8));
});

describe('inventory item codes', () => {
  it.each(['create', 'update'] as const)('advertises nullable bounded code on %s', (operation) => {
    expect(tool(operation).inputSchema.properties?.['code']).toMatchObject({
      type: ['string', 'null'],
      minLength: 1,
      maxLength: 64,
    });
    expect(tool(operation).inputSchema.required).not.toContain('code');
  });

  it.each(['B001', null, 'x'.repeat(64)])('forwards code %s on create', async (code) => {
    const result = await tool('create').handler({ ...create, code });
    expect(result.isError).not.toBe(true);
    expect(inventory.sync.mutations.mock.calls[0]?.[0].mutations[0]).toMatchObject({
      op: 'item.create',
      args: { code },
    });
  });

  it.each(['B001', null, 'x'.repeat(64)])('accepts code-only update %s', async (code) => {
    const result = await tool('update').handler({ ...update, code });
    expect(result.isError).not.toBe(true);
    expect(inventory.sync.mutations).toHaveBeenCalledTimes(1);
    expect(inventory.sync.mutations.mock.calls[0]?.[0].mutations[0]).toMatchObject({
      op: 'item.setCode',
      entityId: ITEM_ID,
      baseRevision: 7,
      catalogueRevision: 2,
      args: { code },
    });
  });

  it.each(['create', 'update'] as const)('trims codes on %s', async (operation) => {
    await tool(operation).handler({
      ...(operation === 'create' ? create : update),
      code: ' B001 ',
    });
    expect(inventory.sync.mutations.mock.calls[0]?.[0].mutations[0].args).toMatchObject({
      code: 'B001',
    });
  });

  it.each(['create', 'update'] as const)(
    'rejects invalid codes on %s before writing',
    async (operation) => {
      for (const code of ['', '   ', 'x'.repeat(65), 42, false, {}, []]) {
        const result = await tool(operation).handler({
          ...(operation === 'create' ? create : update),
          code,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0]).toEqual({
          type: 'text',
          text: 'code must be a string of 1–64 characters or null',
        });
      }
      expect(inventory.sync.mutations).not.toHaveBeenCalled();
    }
  );

  it('uses the applied code revision for edits and stable distinct IDs on retry', async () => {
    inventory.sync.mutations
      .mockResolvedValueOnce(applied(11))
      .mockResolvedValueOnce(applied(12))
      .mockResolvedValueOnce(applied(11))
      .mockResolvedValueOnce(applied(12));
    const input = { ...update, code: 'B001', itemName: 'Renamed', note: null };
    await tool('update').handler(input);
    await tool('update').handler(input);
    const envelopes = inventory.sync.mutations.mock.calls.map((call) => call[0].mutations[0]);
    expect(envelopes).toHaveLength(4);
    expect(envelopes[0]).toMatchObject({
      op: 'item.setCode',
      baseRevision: 7,
      args: { code: 'B001' },
    });
    expect(envelopes[1]).toMatchObject({
      op: 'item.edit',
      baseRevision: 11,
      mutationId: MUTATION_ID,
      args: { name: 'Renamed', note: null },
    });
    expect(envelopes[0]?.mutationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(envelopes[0]?.mutationId).not.toBe(MUTATION_ID);
    expect(envelopes[2]?.mutationId).toBe(envelopes[0]?.mutationId);
    expect(envelopes[3]?.mutationId).toBe(envelopes[1]?.mutationId);
    expect(envelopes[3]?.baseRevision).toBe(11);
    expect(envelopes[1]?.args).not.toHaveProperty('code');
  });

  it.each(['create', 'update'] as const)(
    'names the collision holder on %s and stops further edits',
    async (operation) => {
      inventory.sync.mutations.mockResolvedValueOnce(
        callOk({
          outcomes: [
            {
              mutationId: MUTATION_ID,
              status: 'conflict',
              kind: 'code_collision',
              heldBy: { id: 'other-item', name: 'Existing book' },
              suggestedCode: 'B002',
            },
          ],
          highWaterSeq: 10,
        })
      );
      const result = await tool(operation).handler({
        ...(operation === 'create' ? create : update),
        code: 'B001',
        itemName: 'New name',
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('Existing book');
      expect(JSON.stringify(result.content)).toContain('code_collision');
      expect(inventory.sync.mutations).toHaveBeenCalledTimes(1);
    }
  );

  it('stops edits after a transport failure setting code', async () => {
    inventory.sync.mutations.mockResolvedValueOnce(callUnavailable('inventory'));
    const result = await tool('update').handler({ ...update, code: null, itemName: 'New name' });
    expect(result.isError).toBe(true);
    expect(inventory.sync.mutations).toHaveBeenCalledTimes(1);
  });

  it('reports a later edit rejection after the code applies', async () => {
    inventory.sync.mutations.mockResolvedValueOnce(applied(8)).mockResolvedValueOnce(
      callOk({
        outcomes: [
          { mutationId: MUTATION_ID, status: 'rejected', reason: 'field', message: 'Invalid name' },
        ],
        highWaterSeq: 10,
      })
    );
    const result = await tool('update').handler({ ...update, code: 'B001', itemName: 'New name' });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Invalid name');
    expect(inventory.sync.mutations).toHaveBeenCalledTimes(2);
  });
});
