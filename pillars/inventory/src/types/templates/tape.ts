import { defineType, type TypeDefinition } from '../define-type.js';

const TAPE_USE_CHOICES = [
  'Packing',
  'Electrical',
  'Masking',
  'Duct',
  'Double-sided',
  'Labelling',
  'Other',
] as const;

export const tapeType: TypeDefinition = defineType({
  key: 'tape',
  name: 'Tape',
  legacyLabels: ['Tape'],
  fields: [
    {
      key: 'Use',
      label: 'Use',
      kind: 'choice',
      choices: TAPE_USE_CHOICES,
      hint: 'What it is for, not what it is made of',
    },
    {
      key: 'Width',
      label: 'Width',
      kind: 'measurement',
      dimension: 'length',
      unit: 'mm',
      highlighted: true,
    },
    {
      key: 'Length',
      label: 'Length',
      kind: 'measurement',
      dimension: 'length',
      unit: 'm',
      highlighted: true,
    },
    { key: 'Leaves residue', label: 'Leaves residue', kind: 'flag' },
  ],
});
