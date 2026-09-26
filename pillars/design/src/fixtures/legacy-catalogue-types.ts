import type { CatalogueTypeSummary } from './catalogue-type-model';

/** Existing flat catalogue types retained beside the inventory type tree. */
export const legacyCatalogueTypes: readonly CatalogueTypeSummary[] = [
  {
    id: 'type-electronics',
    key: 'electronics',
    label: 'Electronics',
    parentTypeId: null,
    description: 'Powered devices, accessories and components.',
    status: 'draft',
    itemCount: 184,
    fieldCount: 16,
    capabilities: [],
  },
  {
    id: 'type-furniture',
    key: 'furniture',
    label: 'Furniture',
    parentTypeId: null,
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
    parentTypeId: null,
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
    parentTypeId: null,
    description: 'Garments, footwear and wearable accessories.',
    status: 'archived',
    itemCount: 12,
    fieldCount: 4,
    capabilities: [],
  },
];
