/**
 * The inventory foundation gallery for badges, marks, placement paths, and
 * the canonical concept icon map.
 */
import { coreWorld, kitchen12, kitchen13, television } from '../fixtures/core';
import { INVENTORY_ICONS } from '../model/icons';
import {
  CodeBadge,
  ContainerStateBadge,
  InHandBadge,
  LifecycleBadge,
  QuantityBadge,
  SyncBadge,
  TypeLabel,
} from './badges';
import { ItemMark } from './item-mark';
import { PlacementPath } from './placement-path';

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

import type { InventoryConcept } from '../model/icons';
import type { Placement, PreviousPlacement } from '../model/model';

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</span>
    </div>
  );
}

function Signals() {
  return (
    <div className="space-y-0.5 rounded-lg border bg-card p-3">
      <Line label="Code">
        <CodeBadge code="K12" />
        <CodeBadge code={null} showNone />
      </Line>
      <Line label="Quantity">
        <QuantityBadge quantity={3} />
        <QuantityBadge quantity={40} />
      </Line>
      <Line label="Type">
        <TypeLabel typeName="Electronics" />
        <TypeLabel typeName={null} />
      </Line>
      <Line label="Container">
        <ContainerStateBadge container={kitchen13.container} />
        <ContainerStateBadge container={kitchen12.container} />
        <InHandBadge />
      </Line>
      <Line label="Lifecycle">
        <LifecycleBadge lifecycle="retired" />
        <LifecycleBadge lifecycle="discarded" />
        <LifecycleBadge lifecycle="lost" />
        <LifecycleBadge lifecycle="destroyed" />
      </Line>
      <Line label="Sync">
        <SyncBadge sync="queued" />
        <SyncBadge sync="sending" />
        <SyncBadge sync="stale" />
        <SyncBadge sync="needs-attention" />
      </Line>
      <Line label="Marks">
        <ItemMark item={television} />
        <ItemMark item={kitchen12} />
        <ItemMark item={television} broken />
      </Line>
    </div>
  );
}

const PATHS: readonly [string, Placement | PreviousPlacement][] = [
  ['In a room', { kind: 'location', locationId: 'loc-pantry' }],
  ['Boxes deep', { kind: 'container', containerId: 'box-parts' }],
  ['In hand', { kind: 'in-hand' }],
  ['Box in hand', { kind: 'container', containerId: 'box-bedside' }],
  ['Place deleted', { kind: 'deleted', name: 'Spare room' }],
  ['Offsite', { kind: 'container', containerId: 'box-xmas' }],
];

function Paths() {
  return (
    <div className="space-y-0.5 rounded-lg border bg-card p-3">
      {PATHS.map(([label, placement]) => (
        <Line key={label} label={label}>
          <PlacementPath world={coreWorld} placement={placement} />
        </Line>
      ))}
      <Line label="Folded">
        <PlacementPath
          world={coreWorld}
          placement={{ kind: 'location', locationId: 'loc-toolbox' }}
          maxSegments={2}
        />
      </Line>
    </div>
  );
}

function IconMap() {
  const concepts = Object.keys(INVENTORY_ICONS).filter(
    (key): key is InventoryConcept => key in INVENTORY_ICONS
  );
  return (
    <div className="grid grid-cols-5 gap-x-3 gap-y-1.5 rounded-lg border bg-card p-3 lg:grid-cols-7">
      {concepts.map((concept) => {
        const Icon = INVENTORY_ICONS[concept];
        return (
          <span key={concept} className="flex min-w-0 items-center gap-1.5 text-xs">
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{concept}</span>
          </span>
        );
      })}
    </div>
  );
}

function BadgesGallery() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold">Badges and marks</h2>
            <p className="text-xs text-muted-foreground">Quiet cases draw nothing.</p>
          </div>
          <Signals />
        </section>
        <section className="space-y-2 rounded-xl border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold">Placement paths</h2>
            <p className="text-xs text-muted-foreground">
              The house is implied; hover for the full path.
            </p>
          </div>
          <Paths />
        </section>
      </div>
      <section className="space-y-2 rounded-xl border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">One icon per concept</h2>
          <p className="text-xs text-muted-foreground">Units draw concepts through this map.</p>
        </div>
        <IconMap />
      </section>
    </div>
  );
}

const meta = {
  title: 'Inventory/Foundation/Badges',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Badges: Story = {
  render: () => <BadgesGallery />,
};
