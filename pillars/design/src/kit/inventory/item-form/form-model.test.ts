import { describe, expect, it } from 'vitest';

import { blankDraft, draftAfterSaveAndNew, draftReducer } from './form-draft';
import { deriveForm, hasStagedWork } from './form-view';

import type { FormTypeDef } from '../field-editors/field-model';
import type { DraftAction, ItemDraft } from './form-draft';

const gadget: FormTypeDef = {
  id: 'gadget',
  label: 'Gadget',
  containment: false,
  codeStem: 'G',
  fields: [
    { id: 'ports', label: 'Ports', kind: 'integer', cardinality: 'one' },
    { id: 'manual', label: 'Manual', kind: 'url', cardinality: 'one' },
    {
      id: 'value',
      label: 'Replacement value',
      kind: 'decimal',
      cardinality: 'one',
      computed: { allowOverride: true, reads: ['Ports'] },
    },
  ],
};
const crate: FormTypeDef = {
  id: 'crate',
  label: 'Crate',
  containment: true,
  codeStem: 'C',
  fields: [{ id: 'room', label: 'For room', kind: 'short_text', cardinality: 'one' }],
};
const types = [gadget, crate];
const takenP01 = new Map([['p01', { id: 'itm-printer', name: 'Label printer' }]]);

function apply(draft: ItemDraft, ...actions: DraftAction[]): ItemDraft {
  return actions.reduce(draftReducer, draft);
}

describe('deriveForm', () => {
  it('needs only a name: a blank named draft can be saved', () => {
    const view = deriveForm(apply(blankDraft(), { type: 'name', value: 'Torch' }), types);
    expect(view.blockers).toEqual([]);
  });

  it('holds back the name error until Save is pressed, but always blocks', () => {
    const untouched = deriveForm(blankDraft(), types);
    expect(untouched.nameError).toBeNull();
    expect(untouched.blockers).toEqual(['Name is required.']);
    const submitted = deriveForm(apply(blankDraft(), { type: 'submit' }), types);
    expect(submitted.nameError).toBe('Name is required.');
  });

  it('treats a name of spaces as missing', () => {
    expect(deriveForm(apply(blankDraft(), { type: 'name', value: '   ' }), types).blockers).toEqual(
      ['Name is required.']
    );
  });

  it('blocks on a taken code, naming who holds it', () => {
    const draft = apply(
      blankDraft(),
      { type: 'name', value: 'Printer' },
      { type: 'code', action: { type: 'typed', value: 'P01' } },
      { type: 'code', action: { type: 'checked', taken: takenP01 } }
    );
    expect(deriveForm(draft, types).blockers).toEqual(['P01 is already on Label printer.']);
  });

  it('blocks on a field value that breaks its kind, and skips computed fields', () => {
    const draft = apply(
      blankDraft(undefined, 'gadget'),
      { type: 'name', value: 'Hub' },
      { type: 'field-text', fieldId: 'ports', values: ['four'] },
      { type: 'field-text', fieldId: 'value', values: ['not a number'] }
    );
    const view = deriveForm(draft, types);
    expect(view.fieldErrors).toEqual({ ports: 'Ports needs a whole number.' });
    expect(view.blockers).toEqual(['Ports needs a whole number.']);
  });

  it('hides quantity for a container type and never blocks on it there', () => {
    const draft = apply(blankDraft(undefined, 'crate'), { type: 'name', value: 'Box' });
    const view = deriveForm({ ...draft, quantity: '0' }, types);
    expect(view.showQuantity).toBe(false);
    expect(view.quantityError).toBeNull();
  });

  it('refuses a quantity below one or not whole', () => {
    const named = apply(blankDraft(), { type: 'name', value: 'Mugs' });
    expect(deriveForm({ ...named, quantity: '0' }, types).quantityError).toBe(
      'Quantity is at least 1.'
    );
    expect(deriveForm({ ...named, quantity: '2.5' }, types).quantityError).toBe(
      'Quantity needs a whole number.'
    );
  });

  it('names values a type change leaves behind, and only filled ones', () => {
    const draft = apply(
      blankDraft(undefined, 'gadget'),
      { type: 'field-text', fieldId: 'ports', values: ['4'] },
      { type: 'field-text', fieldId: 'manual', values: [''] },
      { type: 'type', typeId: 'crate', containment: true }
    );
    expect(deriveForm(draft, types).notCarried).toEqual([
      { fieldId: 'ports', label: 'Ports', count: 1 },
    ]);
  });

  it('finds the values again when switching back to the first type', () => {
    const draft = apply(
      blankDraft(undefined, 'gadget'),
      { type: 'field-text', fieldId: 'ports', values: ['4'] },
      { type: 'type', typeId: 'crate', containment: true },
      { type: 'type', typeId: 'gadget', containment: false }
    );
    expect(draft.fields.text['ports']).toEqual(['4']);
    expect(deriveForm(draft, types).notCarried).toEqual([]);
  });
});

describe('draftReducer', () => {
  it('pulls quantity to 1 when a container type is chosen', () => {
    const draft = apply(
      blankDraft(),
      { type: 'quantity', value: '4' },
      { type: 'type', typeId: 'crate', containment: true }
    );
    expect(draft.quantity).toBe('1');
  });

  it('keeps quantity when a plain type is chosen', () => {
    const draft = apply(
      blankDraft(),
      { type: 'quantity', value: '4' },
      { type: 'type', typeId: 'gadget', containment: false }
    );
    expect(draft.quantity).toBe('4');
  });

  it('sets and clears a computed override', () => {
    const set = apply(blankDraft(), { type: 'override', fieldId: 'value', value: '35.00' });
    expect(set.overrides).toEqual({ value: '35.00' });
    expect(apply(set, { type: 'override', fieldId: 'value', value: null }).overrides).toEqual({});
  });

  it('starts a new item in hand unless a destination is given', () => {
    expect(blankDraft().placement).toEqual({ kind: 'in-hand' });
  });
});

describe('draftAfterSaveAndNew', () => {
  it('keeps type and destination and clears everything else', () => {
    const saved = apply(
      blankDraft({ kind: 'container', containerId: 'box-k13' }, 'gadget'),
      { type: 'name', value: 'Hub' },
      { type: 'note', value: 'Spare' },
      { type: 'field-text', fieldId: 'ports', values: ['4'] },
      { type: 'code', action: { type: 'typed', value: 'G1' } },
      { type: 'submit' }
    );
    const next = draftAfterSaveAndNew(saved);
    expect(next.typeId).toBe('gadget');
    expect(next.placement).toEqual({ kind: 'container', containerId: 'box-k13' });
    expect(next.name).toBe('');
    expect(next.note).toBe('');
    expect(next.code.value).toBe('');
    expect(next.fields.text).toEqual({});
    expect(next.submitted).toBe(false);
  });
});

describe('hasStagedWork', () => {
  const initial = blankDraft();

  it('is false for an untouched form, and for values typed then cleared', () => {
    expect(hasStagedWork(initial, initial, 0)).toBe(false);
    const cleared = apply(initial, { type: 'field-text', fieldId: 'ports', values: [''] });
    expect(hasStagedWork(cleared, initial, 0)).toBe(false);
  });

  it('is true for a typed name, a new place, a field value or a staged photo', () => {
    expect(hasStagedWork(apply(initial, { type: 'name', value: 'x' }), initial, 0)).toBe(true);
    expect(
      hasStagedWork(
        apply(initial, {
          type: 'placement',
          placement: { kind: 'location', locationId: 'loc-desk' },
        }),
        initial,
        0
      )
    ).toBe(true);
    expect(
      hasStagedWork(
        apply(initial, { type: 'field-text', fieldId: 'ports', values: ['2'] }),
        initial,
        0
      )
    ).toBe(true);
    expect(hasStagedWork(initial, initial, 1)).toBe(true);
  });
});
