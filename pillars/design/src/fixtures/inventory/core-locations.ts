/**
 * The fictional house every foundation fixture places things in, flat and
 * parent-linked the way the locations API serves it. Ids match the older
 * `inventory-locations` tree so a place named on one screen is the same place
 * on another.
 */
import type { LocationModel } from '@/kit/inventory/shared/model';

export const coreLocations: readonly LocationModel[] = [
  { id: 'loc-house', name: 'Wattle Street house', parentId: null, kind: 'property' },
  { id: 'loc-living', name: 'Living room', parentId: 'loc-house', kind: 'room' },
  { id: 'loc-tv-unit', name: 'TV unit', parentId: 'loc-living', kind: 'furniture' },
  { id: 'loc-tv-drawer', name: 'Left drawer', parentId: 'loc-tv-unit', kind: 'storage' },
  { id: 'loc-bookshelf', name: 'Bookshelf', parentId: 'loc-living', kind: 'furniture' },
  { id: 'loc-study', name: 'Study', parentId: 'loc-house', kind: 'room' },
  { id: 'loc-desk', name: 'Desk', parentId: 'loc-study', kind: 'furniture' },
  { id: 'loc-filing', name: 'Filing cabinet', parentId: 'loc-study', kind: 'storage' },
  { id: 'loc-kitchen', name: 'Kitchen', parentId: 'loc-house', kind: 'room' },
  { id: 'loc-pantry', name: 'Pantry', parentId: 'loc-kitchen', kind: 'storage' },
  { id: 'loc-bedroom', name: 'Main bedroom', parentId: 'loc-house', kind: 'room' },
  { id: 'loc-wardrobe', name: 'Wardrobe', parentId: 'loc-bedroom', kind: 'furniture' },
  { id: 'loc-hall', name: 'Hallway', parentId: 'loc-house', kind: 'room' },
  { id: 'loc-hall-cupboard', name: 'Hall cupboard', parentId: 'loc-hall', kind: 'storage' },
  { id: 'loc-garage', name: 'Garage', parentId: 'loc-house', kind: 'room' },
  { id: 'loc-workbench', name: 'Workbench', parentId: 'loc-garage', kind: 'furniture' },
  { id: 'loc-toolbox', name: 'Red toolbox', parentId: 'loc-workbench', kind: 'storage' },
  { id: 'loc-shelving', name: 'Shelving', parentId: 'loc-garage', kind: 'furniture' },
  { id: 'loc-storage', name: 'Offsite storage unit', parentId: null, kind: 'property' },
  { id: 'loc-storage-bay', name: 'Storage unit bay', parentId: 'loc-storage', kind: 'area' },
];
