import { defineType, type TypeDefinition } from '../define-type.js';

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
      key: 'Load limit',
      label: 'Load limit',
      kind: 'measurement',
      dimension: 'mass',
      unit: 'kg',
      highlighted: true,
    },
    { key: 'Footprint', label: 'Footprint', kind: 'text', hint: 'Outside, in millimetres' },
    { key: 'Stackable', label: 'Stackable', kind: 'flag' },
  ],
});
