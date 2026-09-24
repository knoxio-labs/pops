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

  it('reads one type at an exact revision', async () => {
    const typeId = '6f1d9d7e-3b1f-4b0e-9d5c-2a7f4b1e8c21';

    const result = await tool('inventory.catalogue.getType').handler({ typeId, revision: 4 });

    expect(types.read.type).toHaveBeenCalledWith({ typeId, revision: 4 });
    expect(parseResult(result)).toMatchObject({ type: { id: typeId } });
  });

  it('reads one type at the current revision when none is named', async () => {
    const typeId = '6f1d9d7e-3b1f-4b0e-9d5c-2a7f4b1e8c21';

    await tool('inventory.catalogue.getType').handler({ typeId });

    expect(types.read.type).toHaveBeenCalledWith({ typeId });
  });

  it('refuses a missing or malformed type id and an invalid revision without calling inventory', async () => {
    const getType = tool('inventory.catalogue.getType');

    const missing = await getType.handler({});
    const malformed = await getType.handler({ typeId: 'cable' });
    const badRevision = await getType.handler({
      typeId: '6f1d9d7e-3b1f-4b0e-9d5c-2a7f4b1e8c21',
      revision: 0,
    });

    expect(missing.isError).toBe(true);
    expect(malformed.isError).toBe(true);
    expect(badRevision.isError).toBe(true);
    expect(types.read.type).not.toHaveBeenCalled();
  });

  it('forwards audit pagination', async () => {
    await tool('inventory.catalogue.audit').handler({ before: 12, limit: 25 });

    expect(types.read.audit).toHaveBeenCalledWith({ before: 12, limit: 25 });
  });
});

describe('inventory catalogue draft management', () => {
  it('instructs callers to read exact revisions before every authoring write', () => {
    for (const name of [
      'inventory.catalogue.createDraft',
      'inventory.catalogue.patchDraft',
      'inventory.catalogue.previewDraft',
      'inventory.catalogue.publishDraft',
      'inventory.catalogue.abandonDraft',
    ]) {
      expect(tool(name).description).toContain('Read inventory.catalogue.');
    }
  });

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
      expectedDraftVersion: 3,
      operations,
    });

    expect(types.manage.patchDraft).toHaveBeenCalledWith({
      revision: 5,
      baseRevision: 4,
      expectedDraftVersion: 3,
      operations,
    });
  });

  it('rejects an empty operation list before calling inventory', async () => {
    const result = await tool('inventory.catalogue.patchDraft').handler({
      revision: 5,
      baseRevision: 4,
      expectedDraftVersion: 3,
      operations: [],
    });

    expect(result.isError).toBe(true);
    expect(types.manage.patchDraft).not.toHaveBeenCalled();
  });

  it('previews operations without patching the draft', async () => {
    const operations = [{ kind: 'put_type', key: 'tool', label: 'Tool' }];

    await tool('inventory.catalogue.previewDraft').handler({
      revision: 5,
      baseRevision: 4,
      expectedDraftVersion: 3,
      operations,
    });

    expect(types.manage.previewDraft).toHaveBeenCalledWith({
      revision: 5,
      baseRevision: 4,
      expectedDraftVersion: 3,
      operations,
    });
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
      expectedDraftVersion: 3,
      note: null,
      minimumProtocol: 2,
      migrationName: 'rename_voltage',
      migration,
    });

    expect(types.manage.publishDraft).toHaveBeenCalledWith({
      revision: 5,
      baseRevision: 4,
      expectedDraftVersion: 3,
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
      expectedDraftVersion: 3,
      migration: 'rename_voltage',
    });

    expect(result.isError).toBe(true);
    expect(types.manage.publishDraft).not.toHaveBeenCalled();
  });

  it('rejects a fractional minimum protocol before calling inventory', async () => {
    const result = await tool('inventory.catalogue.publishDraft').handler({
      revision: 5,
      baseRevision: 4,
      expectedDraftVersion: 3,
      minimumProtocol: 1.5,
    });

    expect(result.isError).toBe(true);
    expect(types.manage.publishDraft).not.toHaveBeenCalled();
  });

  it('abandons a draft with its optimistic concurrency revision', async () => {
    await tool('inventory.catalogue.abandonDraft').handler({
      revision: 5,
      baseRevision: 4,
      expectedDraftVersion: 3,
    });

    expect(types.manage.abandonDraft).toHaveBeenCalledWith({
      revision: 5,
      baseRevision: 4,
      expectedDraftVersion: 3,
    });
  });

  it('surfaces an authorization refusal as an MCP error with the required scope to grant', async () => {
    types.manage.abandonDraft.mockResolvedValueOnce({
      kind: 'unauthorized',
      pillar: 'inventory',
      message: "Service account is not authorised for 'inventory.types.manage'",
    });

    const result = await tool('inventory.catalogue.abandonDraft').handler({
      revision: 5,
      baseRevision: 4,
      expectedDraftVersion: 3,
    });

    expect(result.isError).toBe(true);
    const [content] = result.content;
    const text = content?.type === 'text' ? content.text : '';
    expect(text).toContain("Service account is not authorised for 'inventory.types.manage'");
    expect(text).toContain("requires service-account scope 'inventory.types.manage'");
  });

  it('declares the manage scope on every draft-authoring tool and the read scope on every read tool', () => {
    for (const name of [
      'inventory.catalogue.readDraft',
      'inventory.catalogue.createDraft',
      'inventory.catalogue.patchDraft',
      'inventory.catalogue.previewDraft',
      'inventory.catalogue.publishDraft',
      'inventory.catalogue.abandonDraft',
    ]) {
      expect(tool(name).scope).toBe('inventory.types.manage');
    }
    for (const name of [
      'inventory.catalogue.get',
      'inventory.catalogue.getType',
      'inventory.catalogue.audit',
    ]) {
      expect(tool(name).scope).toBe('inventory.types.read');
    }
  });

  it('surfaces the read-scope refusal on a read tool with its own scope, not the manage one', async () => {
    types.read.catalogue.mockResolvedValueOnce({
      kind: 'unauthorized',
      pillar: 'inventory',
      message: "Service account is not authorised for 'inventory.types.read'",
    });

    const result = await tool('inventory.catalogue.get').handler({});

    expect(result.isError).toBe(true);
    const [content] = result.content;
    const text = content?.type === 'text' ? content.text : '';
    expect(text).toContain("requires service-account scope 'inventory.types.read'");
    expect(text).not.toContain('inventory.types.manage');
  });

  it.each([
    ['inventory.catalogue.patchDraft', { operations: [{ kind: 'put_type', key: 'x' }] }],
    ['inventory.catalogue.previewDraft', { operations: [{ kind: 'put_type', key: 'x' }] }],
    ['inventory.catalogue.publishDraft', {}],
    ['inventory.catalogue.abandonDraft', {}],
  ])('%s requires an expected draft version before calling inventory', async (name, extra) => {
    const schema = tool(name).inputSchema;
    const result = await tool(name).handler({ revision: 5, baseRevision: 4, ...extra });

    expect(schema.required).toContain('expectedDraftVersion');
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining('expectedDraftVersion'),
    });
    expect(types.manage.patchDraft).not.toHaveBeenCalled();
    expect(types.manage.previewDraft).not.toHaveBeenCalled();
    expect(types.manage.publishDraft).not.toHaveBeenCalled();
    expect(types.manage.abandonDraft).not.toHaveBeenCalled();
  });

  it('surfaces a stale draft version with the current version and how to recover', async () => {
    types.manage.patchDraft.mockResolvedValueOnce({
      kind: 'conflict',
      pillar: 'inventory',
      code: 'catalogue_draft_conflict',
      message: 'Catalogue draft 5 is at version 4, not 3',
      details: { currentDraftVersion: 4 },
    });

    const result = await tool('inventory.catalogue.patchDraft').handler({
      revision: 5,
      baseRevision: 4,
      expectedDraftVersion: 3,
      operations: [{ kind: 'put_type', key: 'tool', label: 'Tool' }],
    });

    expect(result.isError).toBe(true);
    const [content] = result.content;
    const text = content?.type === 'text' ? content.text : '';
    expect(text).toContain('Catalogue draft 5 is at version 4, not 3');
    expect(text).toContain('"currentDraftVersion":4');
    expect(text).toContain('inventory.catalogue.readDraft');
  });

  it('does not attach draft recovery steps to an unrelated conflict', async () => {
    types.manage.publishDraft.mockResolvedValueOnce({
      kind: 'conflict',
      pillar: 'inventory',
      code: 'catalogue_migration_required',
      message: 'Publication requires a named value migration',
    });

    const result = await tool('inventory.catalogue.publishDraft').handler({
      revision: 5,
      baseRevision: 4,
      expectedDraftVersion: 3,
    });

    expect(result.isError).toBe(true);
    const [content] = result.content;
    expect(content?.type === 'text' ? content.text : '').not.toContain('readDraft');
  });
});
