/**
 * Dragging, frozen mid-drag: two rows grabbed together, a tree whose nodes
 * say whether they would take them, the verdict under the pointer, and the
 * In hand strip at the bottom of the content.
 */
import { coreWorld } from '@/fixtures/inventory/core';

import { cn } from '@pops/ui';

import { dropVerdict } from '../move-plan/move-plan-model';
import { DROP_TARGET_CLASS, DragDock, DragGhost, DropHint } from '../shared/drag-dock';
import { INVENTORY_ICONS } from '../shared/icons';
import { targetName } from '../shared/placement-model';
import { Specimen } from './gallery-frame';

import type { PlacementTarget } from '../shared/model';
import type { DropTargetState } from '../shared/use-drag-placement';

const DRAGGED = ['itm-lamp', 'itm-printer'];

const TARGETS: readonly { target: PlacementTarget; depth: number; over?: boolean }[] = [
  { target: { kind: 'location', locationId: 'loc-study' }, depth: 0 },
  { target: { kind: 'location', locationId: 'loc-desk' }, depth: 1 },
  { target: { kind: 'location', locationId: 'loc-garage' }, depth: 0 },
  { target: { kind: 'location', locationId: 'loc-shelving' }, depth: 1, over: true },
  { target: { kind: 'container', containerId: 'box-o04' }, depth: 1 },
  { target: { kind: 'container', containerId: 'box-cables' }, depth: 2 },
];

function stateOf(target: PlacementTarget, over: boolean): DropTargetState {
  if (!dropVerdict(coreWorld, DRAGGED, target).ok) return 'refused';
  return over ? 'over' : 'available';
}

function TargetNode({ target, depth, over = false }: (typeof TARGETS)[number]) {
  const state = stateOf(target, over);
  const verdict = dropVerdict(coreWorld, DRAGGED, target);
  const Icon = target.kind === 'container' ? INVENTORY_ICONS.container : INVENTORY_ICONS.location;
  const indent = ['pl-2', 'pl-7', 'pl-12'][depth] ?? 'pl-2';
  return (
    <li
      className={cn(
        'flex h-9 items-center gap-2 rounded-md pr-2 text-sm',
        indent,
        DROP_TARGET_CLASS[state]
      )}
      title={verdict.ok ? undefined : verdict.reason}
    >
      <Icon
        className={cn(
          'size-4',
          target.kind === 'container' ? 'text-app-accent' : 'text-muted-foreground'
        )}
        aria-hidden
      />
      <span className="flex-1 truncate">{targetName(coreWorld, target)}</span>
      {state === 'refused' && !verdict.ok ? (
        <span className="truncate text-xs text-muted-foreground">{verdict.reason}</span>
      ) : null}
    </li>
  );
}

/** The drag specimen. */
export function DragGallery() {
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Specimen
        label="Drop targets"
        note="Dashed: takes them. Dimmed: refuses, and says why."
        className="lg:col-span-3"
      >
        <div className="relative rounded-lg border bg-card p-2">
          <ul className="space-y-0.5">
            {TARGETS.map((node) => (
              <TargetNode key={JSON.stringify(node.target)} {...node} />
            ))}
          </ul>
          <div className="absolute top-28 left-40 flex flex-col items-start gap-1.5">
            <DragGhost name="Desk lamp" count={2} />
            <DropHint verdict={{ ok: true, count: 2, targetName: 'Shelving' }} />
          </div>
        </div>
      </Specimen>
      <Specimen label="In hand strip" note="Appears only while dragging." className="lg:col-span-2">
        <div className="space-y-2">
          <DragDock count={2} state="available" />
          <DragDock count={2} state="over" />
          <DragDock count={1} state="refused" reason="Tape measure is already in hand" />
          <DropHint verdict={{ ok: false, reason: 'Office 04 is closed. Open it first.' }} />
        </div>
      </Specimen>
    </div>
  );
}
