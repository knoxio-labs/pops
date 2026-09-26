/**
 * What the command palette can offer over the foundation fixtures: global
 * commands and pages with their registry shortcuts, "This item" verbs for
 * Kitchen 12, every named item and place as a record, a few purchases, and
 * placement targets for the Move step.
 */
import { INVENTORY_ICONS } from '@/kit/inventory/shared/icons';
import { placementTrail } from '@/kit/inventory/shared/placement-model';
import { FilePlus2, LayoutDashboard, ListPlus, Receipt, Search, ShoppingBag } from 'lucide-react';

import { coreInventory, coreLocations, coreWorld } from './core';
import { recentRecordIds } from './recents';

import type { PaletteSource } from '@/kit/inventory/command-palette/palette-groups';
import type { PaletteCommand } from '@/kit/inventory/shared/contracts';
import type { PathSegment } from '@/kit/inventory/shared/placement-model';

const I = INVENTORY_ICONS;

const placeTrail = (id: string): PathSegment[] =>
  coreWorld.items.has(id)
    ? placementTrail(coreWorld, { kind: 'container', containerId: id })
    : placementTrail(coreWorld, { kind: 'location', locationId: id });

const trail = (id: string): string =>
  placeTrail(id)
    .slice(0, -1)
    .filter((segment) => segment.id !== 'loc-house')
    .map((segment) => segment.name)
    .join(' › ');

const itemRecords: PaletteCommand[] = coreInventory.map((entry) => ({
  id: entry.id,
  label: entry.name,
  group: 'records',
  icon: entry.container === null ? I.item : I.container,
  keywords: [entry.code ?? '', entry.typeName ?? ''],
  detail: [entry.code, trail(entry.id)].filter(Boolean).join(' · '),
}));

const placeRecords: PaletteCommand[] = coreLocations.map((node) => ({
  id: node.id,
  label: node.name,
  group: 'records',
  icon: I.location,
  detail: ['Place', trail(node.id)].filter(Boolean).join(' · '),
}));

const commands: PaletteCommand[] = [
  { id: 'cmd-new', label: 'New item', group: 'commands', icon: FilePlus2, shortcutId: 'new-item' },
  {
    id: 'cmd-bulk',
    label: 'Bulk entry',
    group: 'commands',
    icon: ListPlus,
    shortcutId: 'bulk-entry',
  },
  {
    id: 'cmd-search',
    label: 'Search inventory',
    group: 'commands',
    icon: Search,
    shortcutId: 'search',
  },
  { id: 'cmd-labels', label: 'Print labels', group: 'commands', icon: I.label },
  {
    id: 'this-move',
    label: 'Move Kitchen 12',
    group: 'this-item',
    icon: I.move,
    shortcutId: 'detail-move',
    argument: 'placement',
  },
  {
    id: 'this-pick',
    label: 'Pick up Kitchen 12',
    group: 'this-item',
    icon: I.pickUp,
    shortcutId: 'detail-place',
  },
  {
    id: 'this-open',
    label: 'Open Kitchen 12',
    group: 'this-item',
    icon: I.open,
    shortcutId: 'detail-open-close',
  },
  {
    id: 'this-code',
    label: 'Copy code K12',
    group: 'this-item',
    icon: I.code,
    shortcutId: 'detail-copy-code',
  },
  {
    id: 'go-overview',
    label: 'Overview',
    group: 'jump-to',
    icon: LayoutDashboard,
    shortcutId: 'go-overview',
  },
  { id: 'go-items', label: 'Items', group: 'jump-to', icon: I.item, shortcutId: 'go-items' },
  {
    id: 'go-containers',
    label: 'Containers',
    group: 'jump-to',
    icon: I.container,
    shortcutId: 'go-containers',
  },
  {
    id: 'go-locations',
    label: 'Locations',
    group: 'jump-to',
    icon: I.location,
    shortcutId: 'go-locations',
  },
  {
    id: 'go-in-hand',
    label: 'In hand',
    group: 'jump-to',
    icon: I.inHand,
    shortcutId: 'go-in-hand',
  },
  { id: 'go-sync', label: 'Sync', group: 'jump-to', icon: I.sync, shortcutId: 'go-sync' },
];

const purchaseRecords: PaletteCommand[] = [
  {
    id: 'po-1',
    label: 'Cable organiser, 3 pack',
    group: 'records',
    icon: ShoppingBag,
    detail: 'Kmart · 12 Sep 2026 · $14.00',
  },
  {
    id: 'po-2',
    label: 'HDMI cable 2 m',
    group: 'records',
    icon: ShoppingBag,
    detail: 'Officeworks · 2 Aug 2026 · $19.95',
  },
  {
    id: 'po-3',
    label: 'Order 114-2231',
    group: 'records',
    icon: Receipt,
    detail: 'Amazon · 3 items · $86.40',
  },
];

const placementTargets: PaletteCommand[] = [
  ...coreLocations.map((node) => ({
    id: `to-${node.id}`,
    label: node.name,
    group: 'records' as const,
    icon: I.location,
    detail: trail(node.id),
  })),
  ...coreInventory
    .filter((entry) => entry.container?.access === 'open' && entry.lifecycle === 'active')
    .map((entry) => ({
      id: `to-${entry.id}`,
      label: entry.name,
      group: 'records' as const,
      icon: I.open,
      detail: trail(entry.id),
    })),
];

/** The palette's source over the foundation fixtures. */
export const paletteSource: PaletteSource = {
  commands,
  inventoryRecords: [...itemRecords, ...placeRecords],
  purchaseRecords,
  recents: recentRecordIds
    .flatMap((id) => [...itemRecords, ...placeRecords].find((entry) => entry.id === id) ?? [])
    .map((entry) => ({ ...entry, group: 'recents' as const })),
  arguments: { placement: placementTargets },
};
