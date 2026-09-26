/**
 * Badges, marks, placement paths and the icon map: every small signal a
 * row or header can carry, each beside the word it always travels with.
 */
import { coreWorld, kitchen12, kitchen13, television } from '@/fixtures/inventory/core';

import {
  CodeBadge,
  ContainerStateBadge,
  InHandBadge,
  LifecycleBadge,
  QuantityBadge,
  SyncBadge,
  TypeLabel,
} from '../shared/badges';
import { INVENTORY_ICONS } from '../shared/icons';
import { ItemMark } from '../shared/item-mark';
import { PlacementPath } from '../shared/placement-path';
import { Specimen } from './gallery-frame';

import type { ReactNode } from 'react';

import type { InventoryConcept } from '../shared/icons';
import type { Placement, PreviousPlacement } from '../shared/model';

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

/** Badges, paths, marks and icons. */
export function BadgesGallery() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Specimen label="Badges and marks" note="Quiet cases draw nothing.">
          <Signals />
        </Specimen>
        <Specimen label="Placement paths" note="The house is implied; hover for the full path.">
          <Paths />
        </Specimen>
      </div>
      <Specimen label="One icon per concept" note="Units draw concepts through this map.">
        <IconMap />
      </Specimen>
    </div>
  );
}
