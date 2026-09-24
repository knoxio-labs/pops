/** The rest of `kind-vector-specs.ts`'s specs: measurement, date, date_time, url and reference. */
import { DERIVED_MEASUREMENT_UNIT, MEASUREMENT_UNIT } from './catalogue-fields.js';
import { ref } from './reference-values.js';

import type { VectorSpec } from './kind-vector-specs.js';

function measurementSpecs(): readonly VectorSpec[] {
  return [
    {
      name: 'measurement one',
      kind: 'measurement',
      cardinality: 'one',
      storage: 'stored',
      fieldKey: 'measurementOne',
      itemName: 'measurement one',
      values: [{ amount: '4.500', unit: MEASUREMENT_UNIT }],
    },
    {
      name: 'measurement many',
      kind: 'measurement',
      cardinality: 'many',
      storage: 'stored',
      fieldKey: 'measurementMany',
      itemName: 'measurement many',
      values: [
        { amount: '2.25', unit: MEASUREMENT_UNIT },
        { amount: '1', unit: MEASUREMENT_UNIT },
      ],
    },
    {
      name: 'measurement one in a derived unit',
      kind: 'measurement',
      cardinality: 'one',
      storage: 'stored',
      fieldKey: 'measurementDerivedOne',
      itemName: 'measurement derived unit',
      values: [{ amount: '1000.5', unit: DERIVED_MEASUREMENT_UNIT }],
    },
  ];
}

function dateSpecs(): readonly VectorSpec[] {
  return [
    {
      name: 'date one (leap day)',
      kind: 'date',
      cardinality: 'one',
      storage: 'stored',
      fieldKey: 'dateOne',
      itemName: 'date one',
      values: ['2028-02-29'],
    },
    {
      name: 'date many spanning a year boundary',
      kind: 'date',
      cardinality: 'many',
      storage: 'stored',
      fieldKey: 'dateMany',
      itemName: 'date many',
      values: ['2026-12-31', '2027-01-01'],
    },
    {
      name: 'date_time one',
      kind: 'date_time',
      cardinality: 'one',
      storage: 'stored',
      fieldKey: 'dateTimeOne',
      itemName: 'date_time one',
      values: ['2026-09-24T13:45:30.250Z'],
    },
    {
      name: 'date_time many crossing midnight UTC',
      kind: 'date_time',
      cardinality: 'many',
      storage: 'stored',
      fieldKey: 'dateTimeMany',
      itemName: 'date_time many',
      values: ['2026-09-24T23:59:59.999Z', '2026-09-25T00:00:00.000Z'],
    },
  ];
}

function urlSpecs(): readonly VectorSpec[] {
  return [
    {
      name: 'url one',
      kind: 'url',
      cardinality: 'one',
      storage: 'stored',
      fieldKey: 'urlOne',
      itemName: 'url one',
      values: ['https://pops.example/manual.pdf'],
    },
    {
      name: 'url many',
      kind: 'url',
      cardinality: 'many',
      storage: 'stored',
      fieldKey: 'urlMany',
      itemName: 'url many',
      values: ['https://pops.example/a', 'https://pops.example/b'],
    },
  ];
}

/** `liveTargetItemId`/`liveLocationId`: existing rows a `reference` spec below points at. */
export interface ReferenceSpecTargets {
  readonly liveTargetItemId: string;
  readonly liveLocationId: string;
}

function referenceSpecs(targets: ReferenceSpecTargets): readonly VectorSpec[] {
  return [
    {
      name: 'reference one resolving to a live item',
      kind: 'reference',
      cardinality: 'one',
      storage: 'stored',
      fieldKey: 'referenceOne',
      itemName: 'reference one resolved item',
      values: [ref('item', targets.liveTargetItemId)],
    },
    {
      name: 'reference one resolving to a live location',
      kind: 'reference',
      cardinality: 'one',
      storage: 'stored',
      fieldKey: 'referenceOne',
      itemName: 'reference one resolved location',
      values: [ref('location', targets.liveLocationId)],
    },
    {
      name: 'reference many, ordered, mixing item and location targets',
      kind: 'reference',
      cardinality: 'many',
      storage: 'stored',
      fieldKey: 'referenceMany',
      itemName: 'reference many ordered',
      values: [ref('item', targets.liveTargetItemId), ref('location', targets.liveLocationId)],
    },
  ];
}

/** Every measurement, date, date_time, url and reference spec, in a stable order. */
export function buildRemainingKindVectorSpecs(
  targets: ReferenceSpecTargets
): readonly VectorSpec[] {
  return [...measurementSpecs(), ...dateSpecs(), ...urlSpecs(), ...referenceSpecs(targets)];
}
