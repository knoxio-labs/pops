import { Search } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import {
  buildSections,
  palettePlaceholder,
  rankEntries,
  searchResultsHref,
  seeAllResultsEntry,
} from './palette-groups';

import type { PaletteStep } from '@pops/ui';

import type { InventoryPaletteCommand, PaletteSource } from './palette-groups';

function command(
  id: string,
  label: string,
  group: string,
  keywords: readonly string[] = []
): InventoryPaletteCommand {
  return {
    id,
    label,
    group,
    icon: Search,
    keywords,
    action: { kind: 'navigate', href: `/${id}` },
  };
}

const move = command('move', 'Move this item', 'this-item', ['relocate']);
const source: PaletteSource = {
  commands: [
    move,
    command('new', 'New item', 'commands'),
    command('items', 'Items', 'jump-to'),
    command('recent-1', 'One', 'recents'),
    command('recent-2', 'Two', 'recents'),
    command('recent-3', 'Three', 'recents'),
    command('recent-4', 'Four', 'recents'),
    command('recent-5', 'Five', 'recents'),
    command('recent-6', 'Six', 'recents'),
  ],
  inventoryRecords: [command('desk', 'Desk lamp', 'records', ['LAMP-1'])],
  purchaseRecords: [command('purchase', 'Lamp purchase', 'records', ['order-1'])],
  recents: [
    command('recent-1', 'One', 'recents'),
    command('recent-2', 'Two', 'recents'),
    command('recent-3', 'Three', 'recents'),
    command('recent-4', 'Four', 'recents'),
    command('recent-5', 'Five', 'recents'),
    command('recent-6', 'Six', 'recents'),
  ],
  arguments: {
    placement: [command('kitchen', 'Kitchen', 'records'), command('garage', 'Garage', 'records')],
  },
  status: () => 'ready',
};

describe('inventory palette groups', () => {
  it('shows recent, item, and command groups on an empty Inventory query', () => {
    const sections = buildSections('', 'inventory', null, source);

    expect(sections.map((section) => section.id)).toEqual(['recents', 'this-item', 'commands']);
    expect(sections[0]?.entries).toHaveLength(5);
    expect(sections[1]?.entries[0]?.label).toBe('Move this item');
  });

  it('ranks label prefixes ahead of label contains and keyword matches', () => {
    const entries = [
      command('keyword', 'Desk', 'records', ['lamp']),
      command('contains', 'Deskclamp', 'records'),
      command('prefix', 'Lamp shade', 'records'),
    ];

    expect(rankEntries('lamp', entries).map((entry) => entry.id)).toEqual([
      'prefix',
      'contains',
      'keyword',
    ]);
  });

  it('only renders purchase records in the Purchases scope', () => {
    const sections = buildSections('lamp', 'purchases', null, source);

    expect(sections.map((section) => section.id)).toEqual(['records']);
    expect(sections[0]?.entries.map((entry) => entry.id)).toEqual(['purchase']);
  });

  it('uses the argument options and locks out the Search hand-off during a step', () => {
    const step: PaletteStep = { commandId: move.id, label: 'Where to?', argument: 'placement' };
    const sections = buildSections('gar', 'inventory', step, source);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe('Where to?');
    expect(sections[0]?.entries.map((entry) => entry.label)).toEqual(['Garage']);
    expect(seeAllResultsEntry('gar', 'inventory', step)).toBeNull();
  });

  it('owns the trimmed Search URL and preserves the Purchases scope', () => {
    expect(searchResultsHref('  office chair  ', 'inventory')).toBe(
      '/inventory/search?q=office+chair'
    );
    expect(searchResultsHref('order 42', 'purchases')).toBe(
      '/inventory/search?q=order+42&scope=purchases'
    );
    expect(seeAllResultsEntry(' lamp ', 'purchases', null)?.action).toEqual({
      kind: 'navigate',
      href: '/inventory/search?q=lamp&scope=purchases',
    });
  });

  it('changes the placeholder for the active scope and argument', () => {
    const step: PaletteStep = { commandId: move.id, label: 'Where to?', argument: 'placement' };

    expect(palettePlaceholder('inventory', null)).toContain('Search items');
    expect(palettePlaceholder('purchases', null)).toContain('Search purchases');
    expect(palettePlaceholder('inventory', step)).toBe('Where to? Search places and containers');
  });
});
