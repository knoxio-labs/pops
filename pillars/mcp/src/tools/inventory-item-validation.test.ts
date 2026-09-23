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

const { itemValidationTool } = await import('./inventory-item-validation.js');

const TYPE_ID = '10000000-0000-5000-8000-000000000001';
const FIELD_ID = '20000000-0000-5000-8000-000000000001';
const ITEM_ID = '30000000-0000-4000-8000-000000000001';
const validateItem = mockPillarInventory.inventory.types.read.validateItem;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('inventory.items.validate', () => {
  it('forwards a complete source-tagged value set and preserves canonical output', async () => {
    const canonical = [
      {
        fieldId: FIELD_ID,
        source: 'stored',
        values: [{ amount: '1.500', unit: 'kg' }],
      },
    ];
    validateItem.mockResolvedValueOnce(
      callOk({ valid: true, catalogueRevision: 2, typeId: TYPE_ID, fieldValues: canonical })
    );

    const result = await itemValidationTool.handler({
      catalogueRevision: 2,
      typeId: TYPE_ID,
      existingItemId: ITEM_ID,
      fieldValues: canonical,
    });

    expect(validateItem).toHaveBeenCalledWith({
      catalogueRevision: 2,
      typeId: TYPE_ID,
      existingItemId: ITEM_ID,
      fieldValues: canonical,
    });
    expect(parseResult(result)).toEqual({
      valid: true,
      catalogueRevision: 2,
      typeId: TYPE_ID,
      fieldValues: canonical,
    });
  });

  it.each([
    ['enum_option_archived', 'field enum: enum option is archived'],
    ['target_missing', 'field reference: reference target is not live'],
    ['reference_type_mismatch', 'field reference: target type is not permitted'],
  ])('preserves producer diagnostics for %s', async (code, message) => {
    validateItem.mockResolvedValueOnce({
      kind: 'bad-request',
      pillar: 'inventory',
      message,
      code: 'item_validation_failed',
      details: {
        issues: [{ definitionId: FIELD_ID, path: `fieldValues.${FIELD_ID}`, code, message }],
      },
    });

    const result = await itemValidationTool.handler({
      catalogueRevision: 2,
      typeId: TYPE_ID,
      fieldValues: [{ fieldId: FIELD_ID, source: 'stored', values: ['value'] }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({
      type: 'text',
      text: `${message}\n${JSON.stringify({
        code: 'item_validation_failed',
        issues: [{ definitionId: FIELD_ID, path: `fieldValues.${FIELD_ID}`, code, message }],
      })}`,
    });
  });

  it('reports an unavailable inventory pillar', async () => {
    validateItem.mockResolvedValueOnce(callUnavailable('inventory'));
    const result = await itemValidationTool.handler({
      catalogueRevision: 2,
      typeId: TYPE_ID,
      fieldValues: [],
    });
    expect(result.isError).toBe(true);
  });

  it('rejects malformed value groups before making a network call', async () => {
    const result = await itemValidationTool.handler({
      catalogueRevision: 2,
      typeId: TYPE_ID,
      fieldValues: [{ fieldId: FIELD_ID, source: 'stored', values: [] }],
    });
    expect(result.isError).toBe(true);
    expect(validateItem).not.toHaveBeenCalled();
  });
});
