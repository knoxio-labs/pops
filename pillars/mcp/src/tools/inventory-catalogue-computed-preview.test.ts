import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockPillarInventory, parseResult, pillarMockGetter } from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { catalogueTools } = await import('./inventory-catalogue.js');

const TYPE_ID = '6f1d9d7e-3b1f-4b0e-9d5c-2a7f4b1e8c21';
const FIELD_ID = '0b8f5e2a-8f3e-4c1d-9a6b-7d2e1f0c3b4a';
const types = mockPillarInventory.inventory.types;

function previewTool() {
  const found = catalogueTools.find(
    (candidate) => candidate.name === 'inventory.catalogue.previewComputedField'
  );
  if (!found) throw new Error('previewComputedField is not registered');
  return found;
}

const target = { revision: 5, baseRevision: 4, expectedDraftVersion: 3 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('inventory.catalogue.previewComputedField', () => {
  it('evaluates a saved field by id with no operations', async () => {
    const result = await previewTool().handler({
      ...target,
      typeId: TYPE_ID,
      fieldId: FIELD_ID,
      itemId: 'item-1',
    });

    expect(types.manage.previewComputedField).toHaveBeenCalledWith({
      ...target,
      operations: [],
      typeId: TYPE_ID,
      field: { id: FIELD_ID },
      itemId: 'item-1',
    });
    expect(parseResult(result)).toMatchObject({ result: { state: 'value', value: 12 } });
    expect(types.manage.patchDraft).not.toHaveBeenCalled();
  });

  it('evaluates a new field by key after its creating operation', async () => {
    const operations = [{ kind: 'put_field', typeId: TYPE_ID, key: 'volume' }];

    await previewTool().handler({
      ...target,
      operations,
      typeId: TYPE_ID,
      fieldKey: 'volume',
      itemId: 'item-1',
    });

    expect(types.manage.previewComputedField).toHaveBeenCalledWith(
      expect.objectContaining({ operations, field: { key: 'volume' } })
    );
  });

  it.each([
    ['both field names', { fieldId: FIELD_ID, fieldKey: 'volume' }],
    ['no field name', {}],
    ['a missing item', { fieldId: FIELD_ID, itemId: undefined }],
    ['operations that are not objects', { fieldId: FIELD_ID, operations: ['put_field'] }],
    ['no expected draft version', { fieldId: FIELD_ID, expectedDraftVersion: undefined }],
  ])('refuses %s before calling inventory', async (_name, extra) => {
    const result = await previewTool().handler({
      ...target,
      typeId: TYPE_ID,
      itemId: 'item-1',
      ...extra,
    });

    expect(result.isError).toBe(true);
    expect(types.manage.previewComputedField).not.toHaveBeenCalled();
  });

  it('adds draft recovery steps to a stale draft version', async () => {
    types.manage.previewComputedField.mockResolvedValueOnce({
      kind: 'conflict',
      pillar: 'inventory',
      code: 'catalogue_draft_conflict',
      message: 'Catalogue draft 5 is at version 4, not 3',
    });

    const result = await previewTool().handler({
      ...target,
      typeId: TYPE_ID,
      fieldId: FIELD_ID,
      itemId: 'item-1',
    });

    expect(result.isError).toBe(true);
    const [content] = result.content;
    expect(content?.type === 'text' ? content.text : '').toContain('inventory.catalogue.readDraft');
  });

  it('names the manage scope when the service account cannot preview drafts', async () => {
    types.manage.previewComputedField.mockResolvedValueOnce({
      kind: 'unauthorized',
      pillar: 'inventory',
      message: "Service account is not authorised for 'inventory.types.manage'",
    });

    const result = await previewTool().handler({
      ...target,
      typeId: TYPE_ID,
      fieldId: FIELD_ID,
      itemId: 'item-1',
    });

    expect(result.isError).toBe(true);
    const [content] = result.content;
    expect(content?.type === 'text' ? content.text : '').toContain(
      "requires service-account scope 'inventory.types.manage'"
    );
  });
});
