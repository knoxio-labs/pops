import { describe, expect, it } from 'vitest';

import {
  describeContent,
  fieldChoices,
  LABEL_PRESETS,
  matchingPreset,
  NO_DETAILS,
  resolveLabel,
  tickedParts,
  toggleField,
  togglePart,
} from './label-content';

import type { LabelContent, LabelDetails } from './label-content';

const box = { kind: 'container', code: 'B412' } as const;
const thing = { kind: 'item', code: 'K7Q2' } as const;
const uncodedThing = { kind: 'item', code: null } as const;

const boxDetails: LabelDetails = {
  typeName: 'Moving box',
  fields: [
    { id: 'moving-box.room', label: 'Room', value: 'Kitchen' },
    { id: 'moving-box.fragile', label: 'Fragile', value: '' },
  ],
  contents: ['Coffee cups ×6', 'Milk jug'],
};

describe('presets', () => {
  it('matches each preset to itself', () => {
    for (const preset of LABEL_PRESETS) expect(matchingPreset(preset.content)?.id).toBe(preset.id);
  });

  it('matches parts in any order, and not once a field is added', () => {
    expect(matchingPreset({ kind: 'parts', parts: ['code', 'qr'], fields: [] })?.id).toBe(
      'qr-code'
    );
    expect(
      matchingPreset({ kind: 'parts', parts: ['qr', 'code'], fields: ['moving-box.room'] })
    ).toBeNull();
  });

  it('names a custom mix by its parts in label order', () => {
    expect(
      describeContent({ kind: 'parts', parts: ['code', 'name'], fields: ['a.b', 'a.c'] })
    ).toBe('Name, code, 2 fields');
    expect(describeContent({ kind: 'parts', parts: [], fields: ['a.b'] })).toBe('1 field');
    expect(describeContent({ kind: 'parts', parts: [], fields: [] })).toBe('Nothing chosen');
    expect(describeContent({ kind: 'auto' })).toBe('Auto');
  });
});

describe('ticking', () => {
  it('starts a custom mix from the QR and code when ticking from Auto', () => {
    expect(tickedParts({ kind: 'auto' })).toEqual(['qr', 'code']);
    expect(togglePart({ kind: 'auto' }, 'name', true)).toEqual({
      kind: 'parts',
      parts: ['qr', 'name', 'code'],
      fields: [],
    });
  });

  it('unticks a part and keeps the fields', () => {
    const content: LabelContent = { kind: 'parts', parts: ['qr', 'code'], fields: ['a.b'] };
    expect(togglePart(content, 'qr', false)).toEqual({
      kind: 'parts',
      parts: ['code'],
      fields: ['a.b'],
    });
  });

  it('ticks and unticks a field without duplicating it', () => {
    const once = toggleField({ kind: 'auto' }, 'a.b', true);
    expect(toggleField(once, 'a.b', true)).toEqual(once);
    expect(toggleField(once, 'a.b', false)).toEqual({
      kind: 'parts',
      parts: ['qr', 'code'],
      fields: [],
    });
  });
});

describe('resolveLabel', () => {
  it('gives Auto boxes the name and things only the QR and code', () => {
    expect(resolveLabel({ kind: 'auto' }, box, boxDetails).parts).toEqual(['qr', 'name', 'code']);
    expect(resolveLabel({ kind: 'auto' }, thing, NO_DETAILS).parts).toEqual(['qr', 'code']);
  });

  it('prints a box its contents and a thing its code when contents are all that was chosen', () => {
    const content: LabelContent = { kind: 'parts', parts: ['contents'], fields: [] };
    expect(resolveLabel(content, box, boxDetails)).toEqual({
      parts: ['contents'],
      fields: [],
      contents: boxDetails.contents,
      fallback: false,
    });
    expect(resolveLabel(content, thing, NO_DETAILS)).toEqual({
      parts: ['code'],
      fields: [],
      contents: [],
      fallback: true,
    });
  });

  it('falls back to the name on an item that has no code', () => {
    const content: LabelContent = { kind: 'parts', parts: ['contents'], fields: [] };
    expect(resolveLabel(content, uncodedThing, NO_DETAILS).parts).toEqual(['name']);
  });

  it('leaves off an empty box’s contents rather than printing an empty list', () => {
    const content: LabelContent = { kind: 'parts', parts: ['name', 'contents'], fields: [] };
    const empty = resolveLabel(content, box, { ...boxDetails, contents: [] });
    expect(empty.parts).toEqual(['name']);
    expect(empty.contents).toEqual([]);
  });

  it('prints only chosen fields the item has a value for', () => {
    const content: LabelContent = {
      kind: 'parts',
      parts: [],
      fields: ['moving-box.room', 'moving-box.fragile', 'appliance.brand'],
    };
    const label = resolveLabel(content, box, boxDetails);
    expect(label.fields.map((field) => field.id)).toEqual(['moving-box.room']);
    expect(label.fallback).toBe(false);
  });
});

describe('fieldChoices', () => {
  it('lists each field once, with its type, skipping untyped items', () => {
    const appliance: LabelDetails = {
      typeName: 'Appliance',
      fields: [{ id: 'appliance.brand', label: 'Brand', value: 'Sony' }],
      contents: [],
    };
    expect(fieldChoices([boxDetails, appliance, boxDetails, NO_DETAILS])).toEqual([
      { id: 'moving-box.room', label: 'Room', typeName: 'Moving box' },
      { id: 'moving-box.fragile', label: 'Fragile', typeName: 'Moving box' },
      { id: 'appliance.brand', label: 'Brand', typeName: 'Appliance' },
    ]);
  });
});
