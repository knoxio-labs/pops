import { describe, expect, it } from 'vitest';

import { defineType } from '../define-type.js';
import { findIncompatibilities, projectCatalogue } from '../descriptor.js';

import type { TypeMigrationRecord } from '../type-migrations.js';
import type { UnitDefinition } from '../units.js';

const gadgetV1 = defineType({
  key: 'gadget',
  name: 'Gadget',
  fields: [
    { key: 'Colour', label: 'Colour', kind: 'choice', choices: ['Red', 'Blue', 'Green'] },
    { key: 'Weight', label: 'Weight', kind: 'measurement', dimension: 'mass', unit: 'kg' },
  ],
});

const units: readonly UnitDefinition[] = [
  { symbol: 'kg', dimension: 'mass', multiplier: 1 },
  { symbol: 'm', dimension: 'length', multiplier: 1 },
];

describe('projectCatalogue', () => {
  it('produces the same version for the same types regardless of declaration order', () => {
    const widget = defineType({
      key: 'widget',
      name: 'Widget',
      fields: [{ key: 'Size', label: 'Size', kind: 'measurement', dimension: 'length', unit: 'm' }],
    });

    const forward = projectCatalogue([gadgetV1, widget], units);
    const reversed = projectCatalogue([widget, gadgetV1], units);
    expect(forward.version).toBe(reversed.version);
  });

  it('produces the same version when the unit table is declared in a different order', () => {
    const shuffledUnits: readonly UnitDefinition[] = units.toReversed();
    const forward = projectCatalogue([gadgetV1], units);
    const reversed = projectCatalogue([gadgetV1], shuffledUnits);
    expect(forward.version).toBe(reversed.version);
  });

  it('produces the same version when a field object is built with its keys in a different order', () => {
    const reorderedField = {
      kind: 'choice' as const,
      key: 'Colour',
      choices: ['Red', 'Blue', 'Green'],
      label: 'Colour',
    };
    const reordered = defineType({
      key: 'gadget',
      name: 'Gadget',
      fields: [reorderedField, gadgetV1.fields[1]!],
    });
    const forward = projectCatalogue([gadgetV1], units);
    const withReorderedField = projectCatalogue([reordered], units);
    expect(forward.version).toBe(withReorderedField.version);
  });

  it('changes version when a field is added', () => {
    const gadgetV2 = defineType({
      key: 'gadget',
      name: 'Gadget',
      fields: [...gadgetV1.fields, { key: 'Battery', label: 'Battery', kind: 'flag' }],
    });
    const before = projectCatalogue([gadgetV1], units);
    const after = projectCatalogue([gadgetV2], units);
    expect(before.version).not.toBe(after.version);
  });
});

describe('findIncompatibilities', () => {
  it('reports nothing between a catalogue and itself', () => {
    const descriptor = projectCatalogue([gadgetV1], units);
    expect(findIncompatibilities(descriptor, descriptor, [])).toEqual([]);
  });

  it('reports nothing when a type gains a field or a choice gains a value', () => {
    const before = projectCatalogue([gadgetV1], units);
    const grown = defineType({
      key: 'gadget',
      name: 'Gadget',
      fields: [
        {
          key: 'Colour',
          label: 'Colour',
          kind: 'choice',
          choices: ['Red', 'Blue', 'Green', 'Black'],
        },
        { key: 'Weight', label: 'Weight', kind: 'measurement', dimension: 'mass', unit: 'kg' },
        { key: 'Battery', label: 'Battery', kind: 'flag' },
      ],
    });
    const after = projectCatalogue([grown], units);
    expect(findIncompatibilities(before, after, [])).toEqual([]);
  });

  it('fails on a narrowed choice list with no registered migration', () => {
    const before = projectCatalogue([gadgetV1], units);
    const narrowed = defineType({
      key: 'gadget',
      name: 'Gadget',
      fields: [
        { key: 'Colour', label: 'Colour', kind: 'choice', choices: ['Red', 'Blue'] },
        { key: 'Weight', label: 'Weight', kind: 'measurement', dimension: 'mass', unit: 'kg' },
      ],
    });
    const after = projectCatalogue([narrowed], units);
    const incompatibilities = findIncompatibilities(before, after, []);
    expect(incompatibilities).toHaveLength(1);
    expect(incompatibilities[0]?.reason).toMatch(/dropped choice/);
  });

  it('passes the same narrowed choice list once a migration is registered for the type', () => {
    const before = projectCatalogue([gadgetV1], units);
    const narrowed = defineType({
      key: 'gadget',
      name: 'Gadget',
      fields: [
        { key: 'Colour', label: 'Colour', kind: 'choice', choices: ['Red', 'Blue'] },
        { key: 'Weight', label: 'Weight', kind: 'measurement', dimension: 'mass', unit: 'kg' },
      ],
    });
    const after = projectCatalogue([narrowed], units);
    const migrations: TypeMigrationRecord[] = [
      { typeKey: 'gadget', description: 'dropped Green, rewritten to Blue' },
    ];
    expect(findIncompatibilities(before, after, migrations)).toEqual([]);
  });

  it('fails when a measurement field changes dimension with no registered migration', () => {
    const before = projectCatalogue([gadgetV1], units);
    const retyped = defineType({
      key: 'gadget',
      name: 'Gadget',
      fields: [
        { key: 'Colour', label: 'Colour', kind: 'choice', choices: ['Red', 'Blue', 'Green'] },
        { key: 'Weight', label: 'Weight', kind: 'measurement', dimension: 'length', unit: 'm' },
      ],
    });
    const after = projectCatalogue([retyped], units);
    const incompatibilities = findIncompatibilities(before, after, []);
    expect(incompatibilities.some((entry) => entry.reason.includes('changed dimension'))).toBe(
      true
    );
  });

  it('fails when a field changes kind with no registered migration', () => {
    const before = projectCatalogue([gadgetV1], units);
    const rekinded = defineType({
      key: 'gadget',
      name: 'Gadget',
      fields: [
        { key: 'Colour', label: 'Colour', kind: 'text' },
        { key: 'Weight', label: 'Weight', kind: 'measurement', dimension: 'mass', unit: 'kg' },
      ],
    });
    const after = projectCatalogue([rekinded], units);
    const incompatibilities = findIncompatibilities(before, after, []);
    expect(incompatibilities).toEqual([
      { typeKey: 'gadget', reason: 'field "Colour" changed kind from "choice" to "text"' },
    ]);
  });

  it('fails when a field is removed with no registered migration', () => {
    const before = projectCatalogue([gadgetV1], units);
    const shrunk = defineType({
      key: 'gadget',
      name: 'Gadget',
      fields: [
        { key: 'Colour', label: 'Colour', kind: 'choice', choices: ['Red', 'Blue', 'Green'] },
      ],
    });
    const after = projectCatalogue([shrunk], units);
    const incompatibilities = findIncompatibilities(before, after, []);
    expect(incompatibilities.some((entry) => entry.reason.includes('was removed'))).toBe(true);
  });

  it('fails when a type is removed entirely with no registered migration', () => {
    const before = projectCatalogue([gadgetV1], units);
    const after = projectCatalogue([], units);
    const incompatibilities = findIncompatibilities(before, after, []);
    expect(incompatibilities).toEqual([{ typeKey: 'gadget', reason: 'type "gadget" was removed' }]);
  });

  it('passes a removed type once a migration is registered for it', () => {
    const before = projectCatalogue([gadgetV1], units);
    const after = projectCatalogue([], units);
    const migrations: TypeMigrationRecord[] = [
      { typeKey: 'gadget', description: 'retired, superseded by widget' },
    ];
    expect(findIncompatibilities(before, after, migrations)).toEqual([]);
  });
});
