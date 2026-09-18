import { defineType, type TypeDefinition } from '../define-type.js';

const BULB_PROTOCOL_CHOICES = ['Zigbee', 'Z-Wave', 'Wi-Fi', 'Bluetooth', 'Matter', 'None'] as const;

export const bulbType: TypeDefinition = defineType({
  key: 'bulb',
  name: 'Light bulb',
  legacyLabels: ['Bulb', 'Light bulb', 'Light Bulb'],
  fields: [
    {
      key: 'Fitting',
      label: 'Fitting',
      kind: 'choice',
      choices: ['E27', 'GU10', 'B22'],
      hint: 'E27, GU10, B22',
      highlighted: true,
    },
    {
      key: 'Protocol',
      label: 'Protocol',
      kind: 'choice',
      choices: BULB_PROTOCOL_CHOICES,
      highlighted: true,
    },
    {
      key: 'Brightness',
      label: 'Brightness',
      kind: 'measurement',
      dimension: 'brightness',
      unit: 'lm',
    },
    {
      key: 'Colour temperature',
      label: 'Colour temperature',
      kind: 'range',
      dimension: 'colour-temperature',
      unit: 'K',
    },
    { key: 'Dimmable', label: 'Dimmable', kind: 'flag' },
  ],
});
