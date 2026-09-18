import { defineType, type TypeDefinition } from '../define-type.js';

const CONNECTOR_CHOICES = [
  'USB-A',
  'USB-C',
  'Micro-USB',
  'Lightning',
  'HDMI',
  'DisplayPort',
  'Ethernet',
  'Barrel',
  '3.5mm',
  'SATA',
  'Other',
] as const;

export const cableType: TypeDefinition = defineType({
  key: 'cable',
  name: 'Cable',
  legacyLabels: ['Cable'],
  fields: [
    {
      key: 'End A',
      label: 'End A',
      kind: 'choice',
      choices: CONNECTOR_CHOICES,
      hint: 'The connector at one end',
      highlighted: true,
    },
    { key: 'End B', label: 'End B', kind: 'choice', choices: CONNECTOR_CHOICES, highlighted: true },
    {
      key: 'Data rate',
      label: 'Data rate',
      kind: 'measurement',
      dimension: 'data-rate',
      unit: 'Gbps',
    },
    {
      key: 'Power',
      label: 'Power',
      kind: 'measurement',
      dimension: 'power',
      unit: 'W',
      hint: 'What it can carry',
    },
    {
      key: 'Length',
      label: 'Length',
      kind: 'measurement',
      dimension: 'length',
      unit: 'm',
      highlighted: true,
    },
    { key: 'Braided', label: 'Braided', kind: 'flag' },
  ],
});
