export type CatalogueTypeStatus = 'published' | 'draft' | 'archived';

export interface CatalogueTypeSummary {
  id: string;
  key: string;
  label: string;
  description: string;
  status: CatalogueTypeStatus;
  itemCount: number;
  fieldCount: number;
  capabilities: readonly string[];
}

export type CatalogueFieldKind =
  | 'text'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'enum'
  | 'measurement'
  | 'reference';

export interface CatalogueFieldSummary {
  id: string;
  key: string;
  label: string;
  helpText: string;
  kind: CatalogueFieldKind;
  cardinality: 'one' | 'many';
  required: boolean;
  highlighted: boolean;
  storage: 'stored' | 'computed';
  archived?: boolean;
}

export interface CatalogueEnumOption {
  id: string;
  key: string;
  label: string;
  itemCount: number;
  retired?: boolean;
}

export const catalogueTypes: readonly CatalogueTypeSummary[] = [
  {
    id: 'type-electronics',
    key: 'electronics',
    label: 'Electronics',
    description: 'Powered devices, accessories and components.',
    status: 'draft',
    itemCount: 184,
    fieldCount: 8,
    capabilities: [],
  },
  {
    id: 'type-furniture',
    key: 'furniture',
    label: 'Furniture',
    description: 'Furniture and storage pieces used around the home.',
    status: 'published',
    itemCount: 47,
    fieldCount: 5,
    capabilities: ['containment'],
  },
  {
    id: 'type-appliance',
    key: 'appliance',
    label: 'Appliances',
    description: 'Household appliances with energy and warranty details.',
    status: 'published',
    itemCount: 31,
    fieldCount: 6,
    capabilities: [],
  },
  {
    id: 'type-clothing',
    key: 'clothing',
    label: 'Clothing',
    description: 'Garments, footwear and wearable accessories.',
    status: 'archived',
    itemCount: 12,
    fieldCount: 4,
    capabilities: [],
  },
];

export const electronicsFields: readonly CatalogueFieldSummary[] = [
  {
    id: 'field-manufacturer',
    key: 'manufacturer',
    label: 'Manufacturer',
    helpText: 'The company shown on the product or packaging.',
    kind: 'text',
    cardinality: 'one',
    required: true,
    highlighted: true,
    storage: 'stored',
  },
  {
    id: 'field-model',
    key: 'model',
    label: 'Model',
    helpText: 'The manufacturer model name or number.',
    kind: 'text',
    cardinality: 'one',
    required: false,
    highlighted: true,
    storage: 'stored',
  },
  {
    id: 'field-connectors',
    key: 'connectors',
    label: 'Connectors',
    helpText: 'Physical data and power connectors available on this item.',
    kind: 'enum',
    cardinality: 'many',
    required: false,
    highlighted: false,
    storage: 'stored',
  },
  {
    id: 'field-stored-with',
    key: 'stored_with',
    label: 'Stored with',
    helpText: 'Another item that should stay with this one.',
    kind: 'reference',
    cardinality: 'one',
    required: false,
    highlighted: false,
    storage: 'stored',
  },
  {
    id: 'field-unit-price',
    key: 'unit_price',
    label: 'Unit price',
    helpText: 'Replacement price for one unit.',
    kind: 'decimal',
    cardinality: 'one',
    required: false,
    highlighted: false,
    storage: 'stored',
  },
  {
    id: 'field-package-count',
    key: 'package_count',
    label: 'Package count',
    helpText: 'Number of units in the package.',
    kind: 'integer',
    cardinality: 'one',
    required: false,
    highlighted: false,
    storage: 'stored',
  },
  {
    id: 'field-replacement-value',
    key: 'replacement_value',
    label: 'Replacement value',
    helpText: 'Calculated from unit price and package count.',
    kind: 'decimal',
    cardinality: 'one',
    required: false,
    highlighted: true,
    storage: 'computed',
  },
  {
    id: 'field-voltage',
    key: 'voltage',
    label: 'Voltage',
    helpText: 'Nominal input voltage.',
    kind: 'measurement',
    cardinality: 'one',
    required: false,
    highlighted: false,
    storage: 'stored',
    archived: true,
  },
];

export const connectorOptions: readonly CatalogueEnumOption[] = [
  { id: 'option-usb-c', key: 'usb_c', label: 'USB-C', itemCount: 93 },
  { id: 'option-thunderbolt-4', key: 'thunderbolt_4', label: 'Thunderbolt 4', itemCount: 28 },
  { id: 'option-hdmi', key: 'hdmi', label: 'HDMI', itemCount: 61 },
  { id: 'option-lightning', key: 'lightning', label: 'Lightning', itemCount: 17, retired: true },
];

export const validationItems = [
  { id: 'item-macbook', name: 'MacBook Pro 16"', result: 'Valid' },
  { id: 'item-dock', name: 'CalDigit TS4 dock', result: 'Valid' },
  { id: 'item-headphones', name: 'Sony WH-1000XM6', result: 'Manufacturer is required' },
] as const;

export const catalogueRevision = {
  published: 12,
  draft: 13,
  editorBase: 11,
  publishedAt: '22 Sep 2026, 9:42 am',
  editor: 'Joao',
} as const;
