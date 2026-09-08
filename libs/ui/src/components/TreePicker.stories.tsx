import { useState } from 'react';

import { TreePicker } from './TreePicker';

import type { Meta, StoryObj } from '@storybook/react-vite';

import type { TreeNode } from './TreeView';

interface LocationData {
  name: string;
}

function node(
  id: string,
  name: string,
  children: TreeNode<LocationData>[] = []
): TreeNode<LocationData> {
  return { id, data: { name }, children };
}

const LOCATIONS: TreeNode<LocationData>[] = [
  node('home', 'Home', [
    node('bedroom', 'Bedroom', [node('wardrobe', 'Wardrobe'), node('desk', 'Desk')]),
    node('kitchen', 'Kitchen', [node('pantry', 'Pantry')]),
  ]),
  node('storage-unit', 'Storage Unit'),
];

function findPath(
  nodes: TreeNode<LocationData>[],
  id: string,
  trail: TreeNode<LocationData>[] = []
): TreeNode<LocationData>[] | null {
  for (const n of nodes) {
    const nextTrail = [...trail, n];
    if (n.id === id) return nextTrail;
    const found = findPath(n.children, id, nextTrail);
    if (found) return found;
  }
  return null;
}

const meta: Meta<typeof TreePicker> = {
  title: 'Inputs/TreePicker',
  component: TreePicker,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ width: '320px', padding: '2rem' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {},
  render: () => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    return (
      <TreePicker
        nodes={LOCATIONS}
        getLabel={(d) => d.name}
        selectedId={selectedId}
        onSelect={(n) => setSelectedId(n.id)}
      />
    );
  },
};

export const SearchDrivenCreate: Story = {
  args: {},
  render: () => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    return (
      <TreePicker
        nodes={LOCATIONS}
        getLabel={(d) => d.name}
        selectedId={selectedId}
        onSelect={(n) => setSelectedId(n.id)}
        onCreate={(query) => {
          window.alert(`create "${query}" (no-matches flow)`);
        }}
        placeholder="Search locations…"
      />
    );
  },
};

/**
 * The footer slot adds two affordances the search-driven flow alone cannot
 * offer: "Clear selection", which returns the field to empty, and a
 * persistent "Create new" row, reachable whether or not the current search
 * term has any matches. Both are additive — the no-matches inline create
 * (see `SearchDrivenCreate`) still works alongside them.
 */
export const WithFooterSlot: Story = {
  args: {},
  render: () => {
    const [selectedId, setSelectedId] = useState<string | null>('wardrobe');
    return (
      <TreePicker
        nodes={LOCATIONS}
        getLabel={(d) => d.name}
        selectedId={selectedId}
        onSelect={(n) => setSelectedId(n.id)}
        onClear={() => setSelectedId(null)}
        onCreate={(query, parent) => {
          window.alert(`create "${query}" under ${parent?.id ?? 'root'}`);
        }}
        createLabel="Add location"
        placeholder="Search locations…"
      />
    );
  },
};

/**
 * `triggerLabel` already renders arbitrary `ReactNode`, so a consumer can
 * build the selected node's ancestor breadcrumb itself (walking `nodes` for
 * the path to `selectedId`) and hand it in — no new prop is needed on
 * `TreePicker` for this. This mirrors what `LocationPicker`'s hand-rolled
 * trigger does today.
 */
export const BreadcrumbTrigger: Story = {
  args: {},
  render: () => {
    const [selectedId, setSelectedId] = useState<string | null>('wardrobe');
    const path = selectedId ? findPath(LOCATIONS, selectedId) : null;
    const breadcrumb = path?.map((n) => n.data.name).join(' › ');
    return (
      <TreePicker
        nodes={LOCATIONS}
        getLabel={(d) => d.name}
        selectedId={selectedId}
        onSelect={(n) => setSelectedId(n.id)}
        onClear={() => setSelectedId(null)}
        triggerLabel={breadcrumb ?? 'Select location…'}
      />
    );
  },
};

export const CustomTrigger: Story = {
  args: {},
  render: () => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const label = selectedId ? (findPath(LOCATIONS, selectedId)?.at(-1)?.data.name ?? '') : 'Pick…';
    return (
      <TreePicker
        nodes={LOCATIONS}
        getLabel={(d) => d.name}
        selectedId={selectedId}
        onSelect={(n) => setSelectedId(n.id)}
        trigger={
          <button
            type="button"
            className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-secondary-foreground"
          >
            {label}
          </button>
        }
      />
    );
  },
};

export const Disabled: Story = {
  args: {},
  render: () => (
    <TreePicker
      nodes={LOCATIONS}
      getLabel={(d) => d.name}
      onSelect={() => {}}
      disabled
      triggerLabel="Disabled"
    />
  ),
};
