import { Boxes, LayoutDashboard, Package } from 'lucide-react';
import { MemoryRouter } from 'react-router';

import { Badge, Button, cn } from '@pops/ui';

import { NewItemButton } from './new-item-button';
import { AccentTile, InventoryPage } from './page-frame';
import { Segmented } from './segmented';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Inventory/Foundation/Frame',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const segments = [
  { id: 'all', label: 'All items', count: 128 },
  { id: 'attention', label: 'Needs attention', count: 3, alert: true },
  { id: 'empty', label: 'Empty', count: 0, alert: true },
] as const;

export const AccentTiles: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <AccentTile icon={Package} />
      <AccentTile icon={Boxes} size="lg" />
    </div>
  ),
};

export const SegmentedControls: Story = {
  render: () => (
    <div className="space-y-4">
      <Segmented label="Inventory views" segments={segments} value="all" />
      <Segmented
        label="Inventory views with line variant"
        segments={segments}
        value="attention"
        variant="line"
      />
    </div>
  ),
};

export const Page: Story = {
  render: () => (
    <InventoryPage
      title="Inventory"
      description="Keep track of what you own and where it lives."
      icon={LayoutDashboard}
      breadcrumbs={[{ label: 'Inventory', href: '/inventory' }, { label: 'Overview' }]}
      actions={<NewItemButton />}
      tabs={<Segmented label="Inventory views" segments={segments} value="all" />}
      banner={
        <div
          role="status"
          className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm"
        >
          <span>Some changes are waiting for a connection.</span>
          <Badge variant="outline">Offline</Badge>
        </div>
      }
      toolbar={
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
          <span className="text-sm text-muted-foreground">128 items</span>
          <Button variant="outline" size="sm">
            Filter
          </Button>
        </div>
      }
      bodyClassName="gap-3"
      dock={<div className="rounded-lg border bg-card p-3 text-sm">Selection dock</div>}
    >
      <div className={cn('grid min-h-0 flex-1 gap-3 md:grid-cols-3')}>
        {['Open containers', 'In hand', 'Recent work'].map((label) => (
          <section key={label} className="min-h-32 rounded-xl border bg-card p-4">
            <h2 className="font-medium">{label}</h2>
          </section>
        ))}
      </div>
    </InventoryPage>
  ),
};

export const NewItemActions: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <NewItemButton />
      <NewItemButton label="New container" />
      <NewItemButton offline />
    </div>
  ),
};
