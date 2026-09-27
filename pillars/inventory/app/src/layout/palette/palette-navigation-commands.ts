import { FilePlus2, LayoutDashboard, ListPlus, Search } from 'lucide-react';

import { INVENTORY_ICONS } from '../../foundation/model/icons.js';

import type { InventoryPaletteCommand } from './palette-groups.js';

const GLOBAL_COMMANDS = [
  {
    id: 'cmd-new',
    label: 'New item',
    group: 'commands',
    icon: FilePlus2,
    shortcutId: 'new-item',
    action: { kind: 'navigate', href: '/inventory/items/new' },
  },
  {
    id: 'cmd-bulk',
    label: 'Bulk entry',
    group: 'commands',
    icon: ListPlus,
    shortcutId: 'bulk-entry',
    action: { kind: 'navigate', href: '/inventory/items/bulk-new' },
  },
  {
    id: 'cmd-search',
    label: 'Search inventory',
    group: 'commands',
    icon: Search,
    shortcutId: 'search',
    action: { kind: 'navigate', href: '/inventory/search' },
  },
  {
    id: 'cmd-labels',
    label: 'Print labels',
    group: 'commands',
    icon: INVENTORY_ICONS.label,
    action: { kind: 'navigate', href: '/inventory/labels' },
  },
] as const satisfies readonly InventoryPaletteCommand[];

const JUMP_COMMANDS = [
  {
    id: 'go-overview',
    label: 'Overview',
    group: 'jump-to',
    icon: LayoutDashboard,
    shortcutId: 'go-overview',
    action: { kind: 'navigate', href: '/inventory' },
  },
  {
    id: 'go-items',
    label: 'Items',
    group: 'jump-to',
    icon: INVENTORY_ICONS.item,
    shortcutId: 'go-items',
    action: { kind: 'navigate', href: '/inventory/items' },
  },
  {
    id: 'go-containers',
    label: 'Containers',
    group: 'jump-to',
    icon: INVENTORY_ICONS.container,
    shortcutId: 'go-containers',
    action: { kind: 'navigate', href: '/inventory/containers' },
  },
  {
    id: 'go-locations',
    label: 'Locations',
    group: 'jump-to',
    icon: INVENTORY_ICONS.location,
    shortcutId: 'go-locations',
    action: { kind: 'navigate', href: '/inventory/locations' },
  },
  {
    id: 'go-in-hand',
    label: 'In hand',
    group: 'jump-to',
    icon: INVENTORY_ICONS.inHand,
    shortcutId: 'go-in-hand',
    action: { kind: 'navigate', href: '/inventory/in-hand' },
  },
  {
    id: 'go-sync',
    label: 'Sync',
    group: 'jump-to',
    icon: INVENTORY_ICONS.sync,
    shortcutId: 'go-sync',
    action: { kind: 'navigate', href: '/inventory/sync' },
  },
  {
    id: 'go-types',
    label: 'Types',
    group: 'jump-to',
    icon: INVENTORY_ICONS.type,
    shortcutId: 'go-types',
    action: { kind: 'navigate', href: '/inventory/types' },
  },
] as const satisfies readonly InventoryPaletteCommand[];

/** The fixed navigation and creation commands available in every palette. */
export const PALETTE_COMMANDS: readonly InventoryPaletteCommand[] = [
  ...GLOBAL_COMMANDS,
  ...JUMP_COMMANDS,
];
