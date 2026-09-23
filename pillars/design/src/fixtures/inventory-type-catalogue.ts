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
    fieldCount: 13,
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

export { electronicsFields } from './inventory-type-fields';
export type { CatalogueFieldKind, CatalogueFieldSummary } from './inventory-type-fields';

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
