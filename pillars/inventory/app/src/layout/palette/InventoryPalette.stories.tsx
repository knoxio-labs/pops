import { CommandPalettePanel, initialPaletteState } from '@pops/ui';

import { coreInventory, coreItem, coreWorld } from '../../foundation/test-fixtures/core';
import {
  PALETTE_COMMANDS,
  itemRecordCommand,
  locationRecordCommand,
  placementArgumentCommand,
  thisItemCommands,
} from './palette-commands';
import { toUiPaletteSource } from './palette-groups';

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

import type { PaletteSource } from './palette-groups';

const currentItem = coreItem('itm-tv');
const kitchen = coreWorld.locations.get('loc-kitchen');
if (kitchen === undefined) throw new Error('The story fixture is missing the kitchen location');
const records = coreInventory.slice(0, 8).map((item) => itemRecordCommand(item, coreWorld));
const recents = [
  itemRecordCommand(coreItem('itm-lamp'), coreWorld, 'recents'),
  locationRecordCommand(kitchen, coreWorld, 'recents'),
];
const source: PaletteSource = {
  commands: [...PALETTE_COMMANDS, ...thisItemCommands(currentItem)],
  inventoryRecords: records,
  purchaseRecords: [
    itemRecordCommand(coreItem('itm-tv'), coreWorld),
    itemRecordCommand(coreItem('itm-lamp'), coreWorld),
  ],
  recents,
  arguments: {
    placement: [
      placementArgumentCommand({ kind: 'location', locationId: 'loc-kitchen' }, coreWorld),
      placementArgumentCommand({ kind: 'container', containerId: 'box-k13' }, coreWorld),
    ],
  },
  status: () => 'ready',
};

const meta = {
  title: 'Inventory/Layout/Command Palette',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Frame({ children }: { children: ReactNode }) {
  return <div className="min-h-120 rounded-xl bg-background p-6">{children}</div>;
}

export const Overview: Story = {
  render: () => (
    <Frame>
      <CommandPalettePanel
        source={toUiPaletteSource(source)}
        initial={initialPaletteState('inventory')}
      />
    </Frame>
  ),
};

export const Searching: Story = {
  render: () => (
    <Frame>
      <CommandPalettePanel
        source={toUiPaletteSource(source)}
        initial={{ ...initialPaletteState('inventory'), query: 'lamp' }}
      />
    </Frame>
  ),
};

export const ChoosingDestination: Story = {
  render: () => (
    <Frame>
      <CommandPalettePanel
        source={toUiPaletteSource(source)}
        initial={{
          ...initialPaletteState('inventory'),
          steps: [{ commandId: 'this-move', label: 'Move Television', argument: 'placement' }],
        }}
      />
    </Frame>
  ),
};

export const Purchases: Story = {
  render: () => (
    <Frame>
      <CommandPalettePanel
        source={toUiPaletteSource(source)}
        initial={initialPaletteState('purchases')}
      />
    </Frame>
  ),
};
