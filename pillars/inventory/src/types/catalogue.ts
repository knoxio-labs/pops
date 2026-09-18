/**
 * The initial inventory type catalogue: the six templates the approved
 * iOS design (`DesignPlayground/Surfaces/Inventory/Properties`) drew its
 * fixtures against. Field names, kinds, units and which fields are
 * highlighted match those templates exactly.
 *
 * Where a `choice` field's template left its value list open (the
 * playground never closes "End A", "Plug", "Protocol" or "Use" to a fixed
 * set, unlike "Fitting" and "Material"), this catalogue closes it: ADR-002
 * requires a `choice` field to declare its choices, and the fixtures'
 * actual values (`USB-C`, `Type I`, `Zigbee`, `Gaffer`) are included in the
 * chosen list. Narrowing that list later is a type change, guarded by
 * `type-migrations.ts`.
 */
import { defineType, type TypeDefinition } from './define-type.js';

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

const CHARGER_PLUG_CHOICES = [
  'Type A',
  'Type C',
  'Type F',
  'Type G',
  'Type I',
  'Type M',
  'Other',
] as const;

const BULB_PROTOCOL_CHOICES = ['Zigbee', 'Z-Wave', 'Wi-Fi', 'Bluetooth', 'Matter', 'None'] as const;

const TAPE_USE_CHOICES = [
  'Packing',
  'Electrical',
  'Masking',
  'Duct',
  'Double-sided',
  'Labelling',
  'Other',
] as const;

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

/** Every type A1 ships, in the order the playground introduces them. */
export const INVENTORY_TYPES: readonly TypeDefinition[] = [
  cableType,
  chargerType,
  bulbType,
  tapeType,
  storageBoxType,
  furnitureType,
];

/** The type declared under `key`, or `undefined` if the catalogue has none by that key. */
export function findType(key: string): TypeDefinition | undefined {
  return INVENTORY_TYPES.find((type) => type.key === key);
}
