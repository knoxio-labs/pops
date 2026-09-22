import { defineType, type TypeDefinition } from '../define-type.js';

const STORAGE_BOX_DUTY_RATINGS = ['Light', 'Standard', 'Heavy Duty', 'Extra Heavy Duty'] as const;

export const storageBoxType: TypeDefinition = defineType({
  key: 'storage_box',
  name: 'Storage box',
  capabilities: ['containment'],
  legacyLabels: ['Box', 'Storage box', 'Storage Box'],
  fields: [
    {
      key: 'Capacity',
      label: 'Capacity',
      kind: 'measurement',
      dimension: 'volume',
      unit: 'L',
      highlighted: true,
    },
    {
      key: 'Width',
      label: 'Width',
      kind: 'measurement',
      dimension: 'length',
      unit: 'cm',
    },
    {
      key: 'Height',
      label: 'Height',
      kind: 'measurement',
      dimension: 'length',
      unit: 'cm',
    },
    {
      key: 'Depth',
      label: 'Depth',
      kind: 'measurement',
      dimension: 'length',
      unit: 'cm',
    },
    {
      key: 'Load limit',
      label: 'Load limit',
      kind: 'measurement',
      dimension: 'mass',
      unit: 'kg',
      highlighted: true,
    },
    {
      key: 'Duty rating',
      label: 'Duty rating',
      kind: 'choice',
      choices: STORAGE_BOX_DUTY_RATINGS,
      highlighted: true,
    },
    { key: 'Stackable', label: 'Stackable', kind: 'flag' },
  ],
});
