import { OFFLINE_TITLE, StateBanner } from './state-banner';
import { UndoToast } from './undo-toast';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Inventory/Foundation/Feedback',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Toasts: Story = {
  render: () => (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Undo toast</h2>
        <UndoToast concept="move" message="Moved 5 items to Shelving" />
        <UndoToast concept="pickUp" message="Picked up Tape measure" />
        <UndoToast concept="retired" message="Retired Film camera" />
      </section>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">After Undo</h2>
        <UndoToast concept="move" message="Moved 5 items to Shelving" state="undone" />
        <UndoToast concept="move" message="Moved Kitchen 12 to Garage" state="conflict" />
      </section>
    </div>
  ),
};

export const Banners: Story = {
  render: () => (
    <div className="max-w-3xl space-y-2">
      <StateBanner
        kind="stale"
        title="Changed on iPhone 2 minutes ago."
        detail="Your selection stays until you reload."
        actionLabel="Reload"
      />
      <StateBanner
        kind="offline"
        title={OFFLINE_TITLE}
        detail="Changes are off until it is back."
      />
      <StateBanner
        kind="conflict"
        title="Two edits to Manufacturer disagree."
        detail="Here: LG. On iPhone: Samsung. Choose one in Sync."
        actionLabel="Resolve"
      />
      <StateBanner
        kind="needs-attention"
        title="3 items need a decision after the last sync."
        actionLabel="Open Sync"
      />
      <StateBanner
        kind="error"
        title="Items did not load."
        detail="The inventory service did not answer."
        actionLabel="Retry"
      />
    </div>
  ),
};
