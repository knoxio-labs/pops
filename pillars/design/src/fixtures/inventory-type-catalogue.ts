export type CatalogueTypeStatus = 'published' | 'draft' | 'archived';

import { legacyCatalogueTypes } from './legacy-catalogue-types';

export interface CatalogueTypeSummary {
  id: string;
  key: string;
  label: string;
  parentTypeId: string | null;
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
  archived?: boolean;
}

export const inventoryCatalogueTypes: readonly CatalogueTypeSummary[] = [
  {
    id: 'type-bedding',
    key: 'bedding',
    label: 'Bedding',
    parentTypeId: null,
    description: 'Sheets, covers and protective layers for the bed.',
    status: 'published',
    itemCount: 29,
    fieldCount: 6,
    capabilities: ['destination'],
  },
  {
    id: 'type-sheet',
    key: 'sheet',
    label: 'Sheet',
    parentTypeId: 'type-bedding',
    description: 'Fitted and flat sheets.',
    status: 'published',
    itemCount: 8,
    fieldCount: 1,
    capabilities: ['destination'],
  },
  {
    id: 'type-quilt',
    key: 'quilt',
    label: 'Quilt',
    parentTypeId: 'type-bedding',
    description: 'Filled bed coverings.',
    status: 'draft',
    itemCount: 4,
    fieldCount: 1,
    capabilities: ['destination'],
  },
  {
    id: 'type-quilt-cover',
    key: 'quilt_cover',
    label: 'Quilt cover',
    parentTypeId: 'type-bedding',
    description: 'Removable covers for quilts.',
    status: 'published',
    itemCount: 6,
    fieldCount: 1,
    capabilities: ['destination'],
  },
  {
    id: 'type-blanket',
    key: 'blanket',
    label: 'Blanket',
    parentTypeId: 'type-bedding',
    description: 'Loose bed coverings.',
    status: 'published',
    itemCount: 5,
    fieldCount: 3,
    capabilities: ['destination'],
  },
  {
    id: 'type-mattress-protector',
    key: 'mattress_protector',
    label: 'Mattress protector',
    parentTypeId: 'type-bedding',
    description: 'Protective mattress layers.',
    status: 'published',
    itemCount: 2,
    fieldCount: 1,
    capabilities: ['destination'],
  },
  {
    id: 'type-pillows-cushions',
    key: 'pillows_cushions',
    label: 'Pillows & cushions',
    parentTypeId: null,
    description: 'Soft furnishings with a common material vocabulary.',
    status: 'published',
    itemCount: 18,
    fieldCount: 4,
    capabilities: ['destination'],
  },
  {
    id: 'type-pillows',
    key: 'pillows',
    label: 'Pillows',
    parentTypeId: 'type-pillows-cushions',
    description: 'Pillows and pillow covers.',
    status: 'published',
    itemCount: 9,
    fieldCount: 1,
    capabilities: ['destination'],
  },
  {
    id: 'type-pillow',
    key: 'pillow',
    label: 'Pillow',
    parentTypeId: 'type-pillows',
    description: 'Filled sleeping pillows.',
    status: 'published',
    itemCount: 4,
    fieldCount: 1,
    capabilities: ['destination'],
  },
  {
    id: 'type-pillowcase',
    key: 'pillowcase',
    label: 'Pillowcase',
    parentTypeId: 'type-pillows',
    description: 'Removable pillow covers.',
    status: 'published',
    itemCount: 4,
    fieldCount: 1,
    capabilities: ['destination'],
  },
  {
    id: 'type-pillow-protector',
    key: 'pillow_protector',
    label: 'Pillow protector',
    parentTypeId: 'type-pillows',
    description: 'Archived protective pillow layer.',
    status: 'archived',
    itemCount: 1,
    fieldCount: 1,
    capabilities: ['destination'],
  },
  {
    id: 'type-cushions',
    key: 'cushions',
    label: 'Cushions',
    parentTypeId: 'type-pillows-cushions',
    description: 'Cushions and their covers.',
    status: 'published',
    itemCount: 9,
    fieldCount: 2,
    capabilities: ['destination'],
  },
  {
    id: 'type-cushion',
    key: 'cushion',
    label: 'Cushion',
    parentTypeId: 'type-cushions',
    description: 'Filled seat cushions.',
    status: 'published',
    itemCount: 5,
    fieldCount: 1,
    capabilities: ['destination'],
  },
  {
    id: 'type-cushion-cover',
    key: 'cushion_cover',
    label: 'Cushion cover',
    parentTypeId: 'type-cushions',
    description: 'Removable cushion covers.',
    status: 'published',
    itemCount: 4,
    fieldCount: 1,
    capabilities: ['destination'],
  },
];

export const catalogueTypes: readonly CatalogueTypeSummary[] = [
  ...inventoryCatalogueTypes,
  ...legacyCatalogueTypes,
];

export { catalogueFieldsForType, electronicsFields } from './inventory-type-fields';
export type { CatalogueFieldKind, CatalogueFieldSummary } from './inventory-type-fields';

export const connectorOptions: readonly CatalogueEnumOption[] = [
  { id: 'option-usb-c', key: 'usb_c', label: 'USB-C', itemCount: 93 },
  { id: 'option-thunderbolt-4', key: 'thunderbolt_4', label: 'Thunderbolt 4', itemCount: 28 },
  { id: 'option-hdmi', key: 'hdmi', label: 'HDMI', itemCount: 61 },
  { id: 'option-lightning', key: 'lightning', label: 'Lightning', itemCount: 17, archived: true },
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
