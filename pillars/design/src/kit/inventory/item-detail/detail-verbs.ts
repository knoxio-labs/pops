/**
 * The verbs an item page offers, derived from the item alone: the one
 * placement verb that fits where it is (Pick up, Put back, Move), the
 * container verbs its type grants, and the More menu. Verbs a state cannot
 * take stay visible with the reason, so nothing silently disappears.
 */
import { Link2, Pencil } from 'lucide-react';

import { INVENTORY_ICONS, OFFLINE_REASON, targetName } from '../foundation';
import { actCopy, lifecycleActs, restoreLabel } from '../lifecycle/lifecycle-model';

import type { LucideIcon } from 'lucide-react';

import type { ItemRowModel, PlacementWorld } from '../foundation';
import type { LifecycleAct } from '../lifecycle/lifecycle-model';

const I = INVENTORY_ICONS;

/** A header verb. */
export interface DetailVerb {
  id: 'pick-up' | 'put-back' | 'move' | 'open' | 'close' | 'store-here' | 'restore' | 'edit';
  label: string;
  icon: LucideIcon;
  shortcutId?: string;
  /** Tooltip line beyond the label: where Put back puts it. */
  detail?: string;
  disabledReason?: string;
}

/** A More menu entry. */
export interface MenuEntry {
  id: string;
  label: string;
  icon: LucideIcon;
  shortcutId?: string;
  disabledReason?: string;
  /** Irreversible: drawn in red, the only red on the page. */
  destructive?: boolean;
  act?: LifecycleAct;
}

/** Everything the header draws. */
export interface DetailVerbs {
  primary: DetailVerb | null;
  secondary: DetailVerb[];
  edit: DetailVerb | null;
  /** Menu groups, separated by rules. Empty groups are dropped. */
  menu: MenuEntry[][];
}

/** Options the page adds: offline disables every mutation. */
export interface VerbOptions {
  offline?: boolean;
}

function placementVerbs(item: ItemRowModel, world: PlacementWorld): DetailVerb[] {
  const move: DetailVerb = { id: 'move', label: 'Move', icon: I.move, shortcutId: 'detail-move' };
  if (item.placement.kind !== 'in-hand') {
    return [{ id: 'pick-up', label: 'Pick up', icon: I.pickUp, shortcutId: 'detail-place' }, move];
  }
  const previous = item.previous;
  if (previous === null || previous.kind === 'deleted') return [move];
  return [
    {
      id: 'put-back',
      label: 'Put back',
      icon: I.putBack,
      shortcutId: 'detail-place',
      detail: `To ${targetName(world, previous)}`,
    },
    move,
  ];
}

function containerVerbs(item: ItemRowModel): DetailVerb[] {
  if (item.container === null) return [];
  const open = item.container.access === 'open';
  const storeHere: DetailVerb = {
    id: 'store-here',
    label: 'Store here',
    icon: I.container,
    ...(open ? {} : { disabledReason: `${item.name} is closed. Open it to store things.` }),
    ...(open && item.container.full ? { detail: 'Marked full. You can still store here.' } : {}),
  };
  const access: DetailVerb = open
    ? { id: 'close', label: 'Close', icon: I.closed, shortcutId: 'detail-open-close' }
    : { id: 'open', label: 'Open', icon: I.open, shortcutId: 'detail-open-close' };
  return [storeHere, access];
}

function recordEntries(item: ItemRowModel): MenuEntry[] {
  return [
    {
      id: 'copy-code',
      label: 'Copy code',
      icon: I.code,
      shortcutId: 'detail-copy-code',
      ...(item.code === null ? { disabledReason: 'No code yet. Edit the item to add one.' } : {}),
    },
    { id: 'copy-link', label: 'Copy link', icon: Link2 },
    { id: 'label', label: 'Print label', icon: I.label },
    { id: 'history', label: 'History', icon: I.history, shortcutId: 'detail-history' },
  ];
}

function shapeEntries(item: ItemRowModel): MenuEntry[] {
  if (item.container !== null) {
    const full = item.container.full;
    return [{ id: 'toggle-full', label: full ? 'Not full any more' : 'Mark full', icon: I.full }];
  }
  if (item.quantity < 2) return [];
  return [
    { id: 'split', label: 'Split', icon: I.quantity },
    { id: 'change-quantity', label: 'Change quantity', icon: I.quantity },
  ];
}

function lifecycleEntries(item: ItemRowModel): MenuEntry[] {
  return lifecycleActs(item.lifecycle)
    .filter((act) => act !== 'restore')
    .map((act) => ({
      id: act,
      label: actCopy(act).verb,
      icon: I[actCopy(act).concept],
      act,
      ...(act === 'destroy' ? { destructive: true } : {}),
    }));
}

function withReason<T extends { disabledReason?: string }>(entry: T, reason: string): T {
  return entry.disabledReason === undefined ? { ...entry, disabledReason: reason } : entry;
}

const READ_ONLY_ENTRIES = new Set(['copy-code', 'copy-link', 'label', 'history']);
const TERMINAL_ENTRIES = new Set(['copy-code', 'copy-link', 'history']);

/** The verbs and menu for one item. */
export function detailVerbs(
  item: ItemRowModel,
  world: PlacementWorld,
  options: VerbOptions = {}
): DetailVerbs {
  const verbs = derive(item, world);
  if (options.offline !== true) return verbs;
  return {
    primary: verbs.primary && withReason(verbs.primary, OFFLINE_REASON),
    secondary: verbs.secondary.map((verb) => withReason(verb, OFFLINE_REASON)),
    edit: verbs.edit && withReason(verbs.edit, OFFLINE_REASON),
    menu: verbs.menu.map((group) =>
      group.map((entry) =>
        READ_ONLY_ENTRIES.has(entry.id) ? entry : withReason(entry, OFFLINE_REASON)
      )
    ),
  };
}

function derive(item: ItemRowModel, world: PlacementWorld): DetailVerbs {
  if (item.lifecycle === 'destroyed') {
    const kept = recordEntries(item).filter((entry) => TERMINAL_ENTRIES.has(entry.id));
    return { primary: null, secondary: [], edit: null, menu: [kept] };
  }
  const edit: DetailVerb = { id: 'edit', label: 'Edit', icon: Pencil, shortcutId: 'detail-edit' };
  const menu = [recordEntries(item), shapeEntries(item), lifecycleEntries(item)];
  if (item.lifecycle !== 'active') {
    const restore: DetailVerb = {
      id: 'restore',
      label: restoreLabel(item.lifecycle),
      icon: I.undo,
    };
    const kept = [menu[0] ?? [], menu[2] ?? []].filter((group) => group.length > 0);
    return { primary: restore, secondary: [], edit, menu: kept };
  }
  const [first, ...rest] = [...containerVerbs(item), ...placementVerbs(item, world)];
  return {
    primary: first ?? null,
    secondary: rest,
    edit,
    menu: menu.filter((group) => group.length > 0),
  };
}
