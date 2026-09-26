import { coreWorld } from '../test-fixtures/core';
import { recentPlacements } from '../test-fixtures/recents';
import { PlacementPickerPanel } from './placement-picker';

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

const meta = {
  title: 'Inventory/Foundation/PlacementPicker',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof PlacementPickerPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function Frame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl">{children}</div>;
}

/** The item destination picker with quick picks, tree navigation, and creation. */
export const ItemDestination: Story = {
  render: () => (
    <Frame>
      <PlacementPickerPanel
        world={coreWorld}
        subject={{ kind: 'items', ids: ['itm-lamp'] }}
        recents={recentPlacements}
        onPick={() => undefined}
        onCreatePlace={() => undefined}
        initialDrillId="loc-garage"
      />
    </Frame>
  ),
};

/** A deleted previous place stays explicit while the user chooses a replacement. */
export const DeletedPreviousPlace: Story = {
  render: () => (
    <Frame>
      <PlacementPickerPanel
        world={coreWorld}
        subject={{ kind: 'items', ids: ['itm-headphones'] }}
        recents={recentPlacements}
        onPick={() => undefined}
        initialDrillId={null}
      />
    </Frame>
  ),
};
