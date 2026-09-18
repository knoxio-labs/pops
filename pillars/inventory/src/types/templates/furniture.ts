import { defineType, type TypeDefinition } from '../define-type.js';

const FURNITURE_MATERIAL_CHOICES = [
  'Oak',
  'Pine',
  'Walnut',
  'Ash',
  'Beech',
  'MDF',
  'Plywood',
  'Veneer',
  'Rattan',
  'Metal',
  'Glass',
  'Painted wood',
] as const;

export const furnitureType: TypeDefinition = defineType({
  key: 'furniture',
  name: 'Furniture',
  capabilities: ['containment'],
  legacyLabels: ['Furniture'],
  fields: [
    {
      key: 'Footprint',
      label: 'Footprint',
      kind: 'text',
      hint: 'Width × depth × height',
      highlighted: true,
    },
    {
      key: 'Material',
      label: 'Material',
      kind: 'choice',
      choices: FURNITURE_MATERIAL_CHOICES,
      highlighted: true,
    },
    { key: 'Needs two people', label: 'Needs two people', kind: 'flag' },
  ],
});
