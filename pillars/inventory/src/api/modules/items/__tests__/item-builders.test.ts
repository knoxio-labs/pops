import { describe, expect, expectTypeOf, it } from 'vitest';

import { buildCreateValues } from '../create-builder.js';
import { buildInventoryUpdate } from '../update-builder.js';

import type { NullableColumnKeys } from '../nullable-column-keys.js';
import type { CreateInventoryItemInput, UpdateInventoryItemInput } from '../types.js';

type UpdateStringKeys = NullableColumnKeys<UpdateInventoryItemInput, string>;
type UpdateNumberKeys = NullableColumnKeys<UpdateInventoryItemInput, number>;
type CreateStringKeys = NullableColumnKeys<CreateInventoryItemInput, string>;

function createInput(overrides: Partial<CreateInventoryItemInput> = {}): CreateInventoryItemInput {
  return { itemName: 'Kettle', inUse: false, deductible: false, ...overrides };
}

describe('NullableColumnKeys', () => {
  it('admits a nullable text column fed by a nullable string', () => {
    expectTypeOf<'brand'>().toExtend<UpdateStringKeys>();
    expectTypeOf<'locationId'>().toExtend<UpdateStringKeys>();
    expectTypeOf<'brand'>().toExtend<CreateStringKeys>();
  });

  it('rejects a NOT NULL column, which the pass-through would clear', () => {
    expectTypeOf<'itemName'>().not.toExtend<UpdateStringKeys>();
    expectTypeOf<'itemName'>().not.toExtend<CreateStringKeys>();
  });

  it('rejects a column whose type differs from the input value', () => {
    expectTypeOf<'inUse'>().not.toExtend<UpdateStringKeys>();
    expectTypeOf<'deductible'>().not.toExtend<UpdateStringKeys>();
    expectTypeOf<'replacementValue'>().not.toExtend<UpdateStringKeys>();
    expectTypeOf<'brand'>().not.toExtend<UpdateNumberKeys>();
  });

  it('admits a real column fed by a nullable number', () => {
    expectTypeOf<'replacementValue'>().toExtend<UpdateNumberKeys>();
    expectTypeOf<'purchasePrice'>().toExtend<UpdateNumberKeys>();
  });
});

describe('buildInventoryUpdate', () => {
  it('returns null when no field was supplied', () => {
    expect(buildInventoryUpdate({})).toBeNull();
    expect(buildInventoryUpdate({ brand: undefined, replacementValue: undefined })).toBeNull();
  });

  it('omits keys left undefined and writes the ones supplied', () => {
    const updates = buildInventoryUpdate({ brand: 'Sunbeam', model: undefined });

    expect(updates).not.toBeNull();
    expect(updates).toHaveProperty('brand', 'Sunbeam');
    expect(Object.keys(updates ?? {})).not.toContain('model');
  });

  it('writes null to clear a string field', () => {
    expect(buildInventoryUpdate({ notes: null })).toMatchObject({ notes: null });
  });

  it('writes null to clear a number field, and keeps zero', () => {
    expect(buildInventoryUpdate({ replacementValue: null })).toMatchObject({
      replacementValue: null,
    });
    expect(buildInventoryUpdate({ purchasePrice: 0 })).toMatchObject({ purchasePrice: 0 });
  });

  it('maps booleans onto the integer columns, false included', () => {
    expect(buildInventoryUpdate({ inUse: false, deductible: true })).toMatchObject({
      inUse: 0,
      deductible: 1,
    });
  });

  it('derives the purchase transaction URI and drops the stale verdict', () => {
    expect(buildInventoryUpdate({ purchaseTransactionId: 'tx-1' })).toMatchObject({
      purchaseTransactionId: 'tx-1',
      purchaseTransactionUri: 'pops://finance/transaction/tx-1',
      purchaseTransactionStaleAt: null,
    });
  });

  it('clears the derived URI when the id it derives from is cleared', () => {
    expect(buildInventoryUpdate({ purchaseTransactionId: null })).toMatchObject({
      purchaseTransactionId: null,
      purchaseTransactionUri: null,
      purchaseTransactionStaleAt: null,
    });
  });

  it('leaves the derived URI alone when the id is not part of the update', () => {
    const updates = buildInventoryUpdate({ brand: 'Sunbeam' });

    expect(Object.keys(updates ?? {})).not.toContain('purchaseTransactionUri');
    expect(Object.keys(updates ?? {})).not.toContain('purchaseTransactionStaleAt');
  });

  it('stamps lastEditedTime on every write', () => {
    const updates = buildInventoryUpdate({ brand: 'Sunbeam' });

    expect(Number.isNaN(Date.parse(updates?.lastEditedTime ?? ''))).toBe(false);
  });
});

describe('buildCreateValues', () => {
  it('passes supplied values through to their columns', () => {
    const values = buildCreateValues(
      'item-1',
      '2026-09-06T00:00:00.000Z',
      createInput({ brand: 'Sunbeam', purchasePrice: 42.5, inUse: true, deductible: true })
    );

    expect(values).toMatchObject({
      id: 'item-1',
      itemName: 'Kettle',
      brand: 'Sunbeam',
      purchasePrice: 42.5,
      inUse: 1,
      deductible: 1,
      lastEditedTime: '2026-09-06T00:00:00.000Z',
    });
  });

  it('writes null for every absent nullable key, so no column default applies', () => {
    const values = buildCreateValues('item-1', '2026-09-06T00:00:00.000Z', createInput());

    expect(values).toMatchObject({
      brand: null,
      notes: null,
      condition: null,
      replacementValue: null,
      purchasePrice: null,
    });
  });

  it('derives the purchase transaction URI from the id', () => {
    expect(
      buildCreateValues(
        'item-1',
        '2026-09-06T00:00:00.000Z',
        createInput({ purchaseTransactionId: 'tx-1' })
      )
    ).toMatchObject({ purchaseTransactionUri: 'pops://finance/transaction/tx-1' });

    expect(buildCreateValues('item-1', '2026-09-06T00:00:00.000Z', createInput())).toMatchObject({
      purchaseTransactionUri: null,
    });
  });
});
