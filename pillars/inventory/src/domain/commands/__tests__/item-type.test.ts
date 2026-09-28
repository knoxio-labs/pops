import { beforeEach, describe, expect, it } from 'vitest';

import { publishItemTypeTree } from '../../../catalogue/__tests__/type-tree-fixture.js';
import { readItemFieldValues } from '../../../catalogue/item-values.js';
import { mutation, openHarness, seedItem, seedLocation, type Harness } from './test-utils.js';

let h: Harness;

beforeEach(() => {
  h = openHarness();
  seedLocation(h, 'shelf');
  seedItem(h, { id: 'crate', locationId: 'shelf', isContainer: true });
  seedItem(h, { id: 'cable', containerId: 'crate' });
  seedItem(h, { id: 'lamp', locationId: 'shelf' });
});

describe('item.changeType', () => {
  it('sets the type, validates fields, and records the containment capability', () => {
    const outcome = h.run(
      mutation('item.changeType', 'lamp', { typeKey: 'bulb', fields: { Fitting: 'E27' } })
    );
    expect(outcome).toMatchObject({ status: 'applied' });
    expect(h.item('lamp')).toMatchObject({ isContainer: 0, access: null });
    expect(h.fields('lamp')).toEqual({ Fitting: 'E27' });
    expect(
      h.raw.prepare('select count(*) as count from item_field_values where item_id = ?').get('lamp')
    ).toEqual({ count: 1 });
  });

  it('grants containment and a default open access for a containment type', () => {
    h.run(mutation('item.changeType', 'lamp', { typeKey: 'storage_box', fields: {} }));
    expect(h.item('lamp')).toMatchObject({ isContainer: 1, access: 'open' });
  });

  it('rejects an unknown type', () => {
    const outcome = h.run(
      mutation('item.changeType', 'lamp', { typeKey: 'no_such_type', fields: {} })
    );
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'type_unknown' });
  });

  it('rejects fields that do not fit the new type', () => {
    const outcome = h.run(
      mutation('item.changeType', 'lamp', { typeKey: 'bulb', fields: { Fitting: 'not-real' } })
    );
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
  });

  it('rejects dropping containment while the item still holds active contents', () => {
    const outcome = h.run(mutation('item.changeType', 'crate', { typeKey: 'bulb', fields: {} }));
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'has_contents' });
    expect(h.item('crate')).toMatchObject({ isContainer: 1 });
  });

  it('allows dropping containment once the container is empty', () => {
    h.run(mutation('item.setLifecycle', 'cable', { lifecycle: 'discarded', reason: 'used up' }));
    const outcome = h.run(mutation('item.changeType', 'crate', { typeKey: 'bulb', fields: {} }));
    expect(outcome).toMatchObject({ status: 'applied' });
    expect(h.item('crate')).toMatchObject({ isContainer: 0, access: null });
  });

  it('rejects gaining containment while the item is a grouped quantity (ADR-002 D3)', () => {
    seedItem(h, { id: 'screws', quantity: 40 });
    const outcome = h.run(
      mutation('item.changeType', 'screws', {
        typeKey: 'storage_box',
        fields: { Width: { value: 40, unit: 'cm' } },
      })
    );
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'quantity_container_conflict' });
    expect(h.item('screws')).toMatchObject({ isContainer: 0, quantity: 40 });
  });

  it('keeps inherited values on sheet to quilt-cover changes and rejects sheet-only values', () => {
    const catalogue = publishItemTypeTree(h.db);
    const toSheet = h.run(
      mutation(
        'item.changeType',
        'lamp',
        {
          typeId: catalogue.sheetTypeId,
          values: [
            {
              fieldId: catalogue.materialFieldId,
              values: [{ optionId: catalogue.materialCottonOptionId }],
            },
          ],
        },
        { baseRevision: 1, catalogueRevision: catalogue.revision }
      )
    );
    expect(toSheet).toMatchObject({ status: 'applied' });

    const invalid = h.run(
      mutation(
        'item.changeType',
        'lamp',
        {
          typeId: catalogue.quiltCoverTypeId,
          values: [
            {
              fieldId: catalogue.materialFieldId,
              values: [{ optionId: catalogue.materialCottonOptionId }],
            },
            { fieldId: catalogue.fittedFieldId, values: [true] },
          ],
        },
        { baseRevision: 2, catalogueRevision: catalogue.revision }
      )
    );
    expect(invalid).toMatchObject({ status: 'rejected', reason: 'invalid' });

    const changed = h.run(
      mutation(
        'item.changeType',
        'lamp',
        {
          typeId: catalogue.quiltCoverTypeId,
          values: [
            {
              fieldId: catalogue.materialFieldId,
              values: [{ optionId: catalogue.materialCottonOptionId }],
            },
          ],
        },
        { baseRevision: 2, catalogueRevision: catalogue.revision }
      )
    );
    expect(changed).toMatchObject({ status: 'applied' });
    expect(readItemFieldValues(h.db, 'lamp')).toContainEqual({
      fieldId: catalogue.materialFieldId,
      source: 'stored',
      catalogueRevision: catalogue.revision,
      values: [{ optionId: catalogue.materialCottonOptionId }],
    });
  });

  it('reverts a type change by removing its persisted stored values', () => {
    h.run(mutation('item.changeType', 'lamp', { typeKey: 'bulb', fields: { Fitting: 'E27' } }));
    const event = h.eventsFor('lamp')[0];
    if (!event) throw new Error('expected the type change event');

    const outcome = h.run(
      mutation('event.revert', 'lamp', { seq: event.seq }, { baseRevision: null })
    );

    expect(outcome).toMatchObject({ status: 'applied' });
    expect(h.item('lamp').typeId).toBeNull();
    expect(h.fields('lamp')).toEqual({});
    expect(
      h.raw.prepare('select count(*) as count from item_field_values where item_id = ?').get('lamp')
    ).toEqual({ count: 0 });
  });

  it('rewrites equal protocol-1 fields under the new type IDs and reverts them', () => {
    h.run(
      mutation('item.changeType', 'cable', {
        typeKey: 'cable',
        fields: { Length: { value: 1, unit: 'm' } },
      })
    );
    const cableValue = h.raw
      .prepare('select field_id as fieldId from item_field_values where item_id = ?')
      .get('cable') as { fieldId: string };
    const outcome = h.run(
      mutation(
        'item.changeType',
        'cable',
        { typeKey: 'tape', fields: { Length: { value: 1, unit: 'm' } } },
        { baseRevision: 2 }
      )
    );
    expect(outcome).toMatchObject({ status: 'applied' });
    expect(h.fields('cable')).toEqual({ Length: { value: 1, unit: 'm' } });
    const tapeValue = h.raw
      .prepare('select field_id as fieldId from item_field_values where item_id = ?')
      .get('cable') as { fieldId: string };
    expect(tapeValue.fieldId).not.toBe(cableValue.fieldId);
    const changed = h.eventsFor('cable').at(-1);
    if (!changed) throw new Error('expected the cross-type change event');

    const reverted = h.run(
      mutation('event.revert', 'cable', { seq: changed.seq }, { baseRevision: null })
    );

    expect(reverted).toMatchObject({ status: 'applied' });
    expect(h.fields('cable')).toEqual({ Length: { value: 1, unit: 'm' } });
    const restoredValue = h.raw
      .prepare('select field_id as fieldId from item_field_values where item_id = ?')
      .get('cable') as { fieldId: string };
    expect(restoredValue.fieldId).toBe(cableValue.fieldId);
  });
});
