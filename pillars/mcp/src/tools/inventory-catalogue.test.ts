import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockPillarInventory, parseResult, pillarMockGetter } from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { catalogueTools } = await import('./inventory-catalogue.js');

function tool(name: string) {
  const found = catalogueTools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Tool not found: ${name}`);
  return found;
}

const types = mockPillarInventory.inventory.types;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('inventory catalogue reads', () => {
  it('reads an exact catalogue revision', async () => {
    const result = await tool('inventory.catalogue.get').handler({ revision: 3 });

    expect(types.read.catalogue).toHaveBeenCalledWith({ revision: 3 });
    expect(parseResult(result)).toEqual({ revision: { revision: 1 }, types: [] });
  });

  it('forwards audit pagination', async () => {
    await tool('inventory.catalogue.audit').handler({ before: 12, limit: 25 });

    expect(types.read.audit).toHaveBeenCalledWith({ before: 12, limit: 25 });
  });
});

describe('inventory catalogue draft management', () => {
  it('advertises the complete discriminated operation and migration schemas', () => {
    expect(tool('inventory.catalogue.patchDraft').inputSchema).toMatchObject({
      properties: {
        revision: { type: 'integer', minimum: 1 },
        operations: {
          items: {
            oneOf: [
              { properties: { kind: { const: 'put_type' } }, required: ['kind'] },
              {
                properties: { kind: { const: 'put_field' }, typeId: { format: 'uuid' } },
                required: ['kind', 'typeId'],
              },
              {
                properties: { kind: { const: 'put_enum_option' }, fieldId: { format: 'uuid' } },
                required: ['kind', 'fieldId'],
              },
              {
                properties: {
                  kind: { enum: ['archive_type', 'archive_field', 'archive_enum_option'] },
                },
              },
              {
                properties: { kind: { const: 'reorder' } },
                required: ['kind', 'definition', 'ids'],
              },
            ],
          },
        },
      },
    });
    expect(tool('inventory.catalogue.publishDraft').inputSchema).toMatchObject({
      properties: {
        minimumProtocol: { type: 'integer', minimum: 1 },
        migration: {
          properties: {
            steps: {
              items: {
                oneOf: expect.arrayContaining([
                  expect.objectContaining({
                    properties: expect.objectContaining({ kind: { const: 'convert_decimal' } }),
                    required: ['kind', 'fromFieldId', 'toFieldId', 'factor'],
                  }),
                ]),
              },
            },
          },
        },
      },
    });
  });

  it('reads the current draft for recovery without inventing a revision', async () => {
    const result = await tool('inventory.catalogue.readDraft').handler({});

    expect(types.manage.readDraft).toHaveBeenCalledWith();
    expect(parseResult(result)).toEqual({ revision: { revision: 2 }, types: [] });
  });

  it('preserves a missing-draft failure instead of treating it as an empty draft', async () => {
    types.manage.readDraft.mockResolvedValueOnce({
      kind: 'upstream',
      pillar: 'inventory',
      status: 404,
      message: 'catalogue draft not found',
    });

    const result = await tool('inventory.catalogue.readDraft').handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'catalogue draft not found',
    });
  });

  it('creates a draft from the named published revision', async () => {
    await tool('inventory.catalogue.createDraft').handler({ baseRevision: 4 });

    expect(types.manage.createDraft).toHaveBeenCalledWith({ baseRevision: 4 });
  });

  it('rejects an invalid base revision before calling inventory', async () => {
    const result = await tool('inventory.catalogue.createDraft').handler({ baseRevision: 0 });

    expect(result.isError).toBe(true);
    expect(types.manage.createDraft).not.toHaveBeenCalled();
  });

  it('patches a draft with ordered operations', async () => {
    const operations = [
      { kind: 'put_type', key: 'tool', label: 'Tool' },
      { kind: 'reorder', definition: 'type', ids: ['type-1'] },
    ];

    await tool('inventory.catalogue.patchDraft').handler({
      revision: 5,
      baseRevision: 4,
      operations,
    });

    expect(types.manage.patchDraft).toHaveBeenCalledWith({
      revision: 5,
      baseRevision: 4,
      operations,
    });
  });

  it('rejects an empty operation list before calling inventory', async () => {
    const result = await tool('inventory.catalogue.patchDraft').handler({
      revision: 5,
      baseRevision: 4,
      operations: [],
    });

    expect(result.isError).toBe(true);
    expect(types.manage.patchDraft).not.toHaveBeenCalled();
  });

  it('publishes with nullable notes, protocol gates, and a migration intact', async () => {
    const migration = {
      name: 'rename_voltage',
      fromRevision: 4,
      toRevision: 5,
      affectedTypeIds: ['type-1'],
      affectedFieldIds: ['field-1'],
      steps: [{ kind: 'copy', fromFieldId: 'field-1', toFieldId: 'field-2' }],
    };

    await tool('inventory.catalogue.publishDraft').handler({
      revision: 5,
      baseRevision: 4,
      note: null,
      minimumProtocol: 2,
      migrationName: 'rename_voltage',
      migration,
    });

    expect(types.manage.publishDraft).toHaveBeenCalledWith({
      revision: 5,
      baseRevision: 4,
      note: null,
      minimumProtocol: 2,
      migrationName: 'rename_voltage',
      migration,
    });
  });

  it('rejects a non-object migration before calling inventory', async () => {
    const result = await tool('inventory.catalogue.publishDraft').handler({
      revision: 5,
      baseRevision: 4,
      migration: 'rename_voltage',
    });

    expect(result.isError).toBe(true);
    expect(types.manage.publishDraft).not.toHaveBeenCalled();
  });

  it('rejects a fractional minimum protocol before calling inventory', async () => {
    const result = await tool('inventory.catalogue.publishDraft').handler({
      revision: 5,
      baseRevision: 4,
      minimumProtocol: 1.5,
    });

    expect(result.isError).toBe(true);
    expect(types.manage.publishDraft).not.toHaveBeenCalled();
  });

  it('abandons a draft with its optimistic concurrency revision', async () => {
    await tool('inventory.catalogue.abandonDraft').handler({ revision: 5, baseRevision: 4 });

    expect(types.manage.abandonDraft).toHaveBeenCalledWith({ revision: 5, baseRevision: 4 });
  });

  it('surfaces an authorization refusal as an MCP error', async () => {
    types.manage.abandonDraft.mockResolvedValueOnce({
      kind: 'unauthorized',
      pillar: 'inventory',
      message: "Service account is not authorised for 'inventory.types.manage'",
    });

    const result = await tool('inventory.catalogue.abandonDraft').handler({
      revision: 5,
      baseRevision: 4,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: "Service account is not authorised for 'inventory.types.manage'",
    });
  });
});
