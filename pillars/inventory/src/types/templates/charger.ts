import { defineType, type TypeDefinition } from '../define-type.js';

const CHARGER_PLUG_CHOICES = [
  'Type A',
  'Type C',
  'Type F',
  'Type G',
  'Type I',
  'Type M',
  'Other',
] as const;

export const chargerType: TypeDefinition = defineType({
  key: 'charger',
  name: 'Charger',
  legacyLabels: ['Charger'],
  fields: [
    {
      key: 'Ports',
      label: 'Ports',
      kind: 'text',
      hint: 'Each port and what it does',
      highlighted: true,
    },
    {
      key: 'Power',
      label: 'Power',
      kind: 'measurement',
      dimension: 'power',
      unit: 'W',
      highlighted: true,
    },
    { key: 'Folding pins', label: 'Folding pins', kind: 'flag' },
    { key: 'Plug', label: 'Plug', kind: 'choice', choices: CHARGER_PLUG_CHOICES },
  ],
});
