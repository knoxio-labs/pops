import { Archive, Download, LockKeyhole, MoveRight } from 'lucide-react';
import { useState } from 'react';

import { SelectionBar } from './selection-bar';

import type { Meta, StoryObj } from '@storybook/react-vite';

import type { SelectionBarAction } from '../model';
import type { SelectionCoverage } from './use-selection';

const meta = {
  title: 'Inventory/Foundation/SelectionBar',
  component: SelectionBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({
  initialCount,
  loadedCount,
  initialCoverage,
  carriedCount = 0,
  actions,
}: {
  initialCount: number;
  loadedCount: number;
  initialCoverage: SelectionCoverage;
  carriedCount?: number;
  actions: readonly SelectionBarAction[];
}) {
  const [count, setCount] = useState(initialCount);
  const [coverage, setCoverage] = useState(initialCoverage);
  return (
    <div className="mx-auto max-w-3xl rounded-xl border bg-muted/30 p-6">
      <SelectionBar
        count={count}
        loadedCount={loadedCount}
        coverage={coverage}
        carriedCount={carriedCount}
        actions={actions}
        onSelectAll={() => {
          setCount(loadedCount);
          setCoverage('all');
        }}
        onClear={() => setCount(0)}
      />
    </div>
  );
}

const COMMON_ACTIONS: readonly SelectionBarAction[] = [
  { id: 'archive', label: 'Archive', icon: Archive, shortcutId: 'move' },
  { id: 'move', label: 'Move', icon: MoveRight, shortcutId: 'label' },
  { id: 'download', label: 'Download', icon: Download, overflow: true },
];

export const Partial: Story = {
  args: {
    count: 2,
    loadedCount: 8,
    coverage: 'some',
    carriedCount: 3,
    actions: COMMON_ACTIONS,
  },
  render: () => (
    <Demo
      initialCount={2}
      loadedCount={8}
      initialCoverage="some"
      carriedCount={3}
      actions={COMMON_ACTIONS}
    />
  ),
};

export const AllLoaded: Story = {
  args: {
    count: 8,
    loadedCount: 8,
    coverage: 'all',
    actions: COMMON_ACTIONS,
  },
  render: () => (
    <Demo initialCount={8} loadedCount={8} initialCoverage="all" actions={COMMON_ACTIONS} />
  ),
};

export const DisabledAction: Story = {
  args: {
    count: 1,
    loadedCount: 4,
    coverage: 'some',
    actions: COMMON_ACTIONS,
  },
  render: () => (
    <Demo
      initialCount={1}
      loadedCount={4}
      initialCoverage="some"
      actions={[
        ...COMMON_ACTIONS,
        {
          id: 'locked',
          label: 'Unavailable',
          icon: LockKeyhole,
          disabledReason: 'Unavailable while offline.',
        },
      ]}
    />
  ),
};

export const Empty: Story = {
  args: {
    count: 0,
    loadedCount: 0,
    coverage: 'none',
    actions: COMMON_ACTIONS,
  },
  render: () => (
    <Demo initialCount={0} loadedCount={0} initialCoverage="none" actions={COMMON_ACTIONS} />
  ),
};
