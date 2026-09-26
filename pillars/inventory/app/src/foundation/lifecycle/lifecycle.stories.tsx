import { UndoToast } from '../feedback/undo-toast';
import { DestroyDialog } from './destroy-dialog';
import { LifecycleDialog } from './lifecycle-dialog';
import { QuantityDialog } from './quantity-dialog';
import { RestoreDialog } from './restore-dialog';
import { SplitDialog } from './split-dialog';

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

const meta = {
  title: 'Inventory/Foundation/Lifecycle',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Frame({ children }: { children: ReactNode }) {
  return <div className="min-h-80 rounded-xl border bg-card p-4">{children}</div>;
}

/** The reversible retire act for one item. */
export const Retire: Story = {
  render: () => (
    <Frame>
      <LifecycleDialog act="retire" subject="Film camera" open onOpenChange={() => undefined} />
    </Frame>
  ),
};

/** The lost-item act with its last known place retained. */
export const Lost: Story = {
  render: () => (
    <Frame>
      <LifecycleDialog act="lost" subject="Umbrella" open onOpenChange={() => undefined} />
    </Frame>
  ),
};

/** Discard requires either a preset or text for Other. */
export const Discard: Story = {
  render: () => (
    <Frame>
      <LifecycleDialog
        act="discard"
        subject="Bluetooth speaker"
        open
        onOpenChange={() => undefined}
      />
    </Frame>
  ),
};

/** Destroy is the irreversible alert dialog. */
export const Destroy: Story = {
  render: () => (
    <Frame>
      <DestroyDialog subject="Phone" contentsCount={2} open onOpenChange={() => undefined} />
    </Frame>
  ),
};

/** Restore offers the place the item left and an in-hand option. */
export const Restore: Story = {
  render: () => (
    <Frame>
      <RestoreDialog
        itemName="Umbrella"
        lifecycle="lost"
        lastPlace="Hall cupboard"
        open
        onOpenChange={() => undefined}
      />
    </Frame>
  ),
};

/** Split validates the count before creating the second record. */
export const Split: Story = {
  render: () => (
    <Frame>
      <SplitDialog
        itemName="Cables"
        quantity={6}
        placeName="Kitchen 12"
        open
        onOpenChange={() => undefined}
      />
    </Frame>
  ),
};

/** Change quantity keeps the no-zero and container rules visible. */
export const ChangeQuantity: Story = {
  render: () => (
    <Frame>
      <QuantityDialog itemName="Cables" quantity={6} open onOpenChange={() => undefined} />
    </Frame>
  ),
};

/** A bulk lifecycle act tells every selected item which reason it receives. */
export const BulkRetire: Story = {
  render: () => (
    <Frame>
      <LifecycleDialog act="retire" subject={6} open onOpenChange={() => undefined} />
    </Frame>
  ),
};

/** A failed undo keeps the conflict action available in history. */
export const UndoConflict: Story = {
  render: () => (
    <Frame>
      <UndoToast
        concept="move"
        message="Moved Television to Garage"
        state="conflict"
        onOpenHistory={() => undefined}
      />
    </Frame>
  ),
};
