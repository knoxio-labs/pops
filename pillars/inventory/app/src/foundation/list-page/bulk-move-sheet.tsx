import { useCallback, useMemo, useRef, useState } from 'react';

import { Sheet } from '@pops/ui';

import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { buildWorld } from '../model/placement-model.js';
import { planMove } from '../move-plan/move-plan-model.js';
import { MovePlanPanel } from '../move-plan/move-plan.js';

import type { ReactElement, RefObject } from 'react';

import type { ItemRowModel, PickerSubject, PlacementTarget } from '../model/index.js';
import type { PlacementWorld } from '../model/placement-model.js';
import type { MovePlan } from '../move-plan/move-plan-model.js';

type PickerMode = 'bulk' | 'row';

function rectPoint(element: Element | null): { top: number; left: number } {
  if (element === null) return { top: 0, left: 0 };
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left };
}

function activeRow(body: HTMLElement | null): Element | null {
  const active = document.activeElement;
  if (!(active instanceof Element) || body === null) return null;
  const grid = active.closest('[role="grid"]');
  if (grid === null || grid === active || !body.contains(grid)) return null;
  const row = active.closest('[role="row"], [role="gridcell"]');
  return row !== null && grid.contains(row) ? row : null;
}

function resolveAnchor(
  mode: PickerMode,
  explicit: Element | null | undefined,
  dockAnchorRef: RefObject<HTMLDivElement | null>
): { top: number; left: number } {
  if (mode === 'bulk' && dockAnchorRef.current !== null) {
    return rectPoint(dockAnchorRef.current);
  }
  if (mode === 'row' && explicit !== undefined && explicit !== null) {
    return rectPoint(explicit);
  }
  const body = document.querySelector<HTMLElement>('[data-list-body]');
  if (mode === 'row') {
    const row = activeRow(body) ?? body?.querySelector<HTMLElement>('[data-focused]') ?? null;
    if (row !== null) return rectPoint(row);
  }
  return rectPoint(body);
}

function usePlacementData(
  rows: readonly ItemRowModel[],
  pickerOpen: boolean,
  pickerIds: readonly string[]
) {
  const pickerSubject = useMemo(
    (): PickerSubject => ({ kind: 'items', ids: pickerOpen ? pickerIds : [] }),
    [pickerIds, pickerOpen]
  );
  const sources = usePlacementSources(pickerSubject);
  const moveWorld = useMemo(
    () =>
      buildWorld([...sources.world.items.values(), ...rows], [...sources.world.locations.values()]),
    [rows, sources.world]
  );
  return { pickerSubject, sources, moveWorld };
}

function pickerHandler(input: {
  pickerMode: PickerMode;
  rows: readonly ItemRowModel[];
  moveWorld: PlacementWorld;
  pickerIds: readonly string[];
  onRowMove: (id: string, itemName: string, target: PlacementTarget, world: PlacementWorld) => void;
  onBulkPickUp: (ids: readonly string[]) => Promise<void>;
  setPickerOpen: (open: boolean) => void;
  setPlanWorld: (world: PlacementWorld | null) => void;
  setMoveTarget: (target: PlacementTarget | null) => void;
  setMoveSheetOpen: (open: boolean) => void;
}): (target: PlacementTarget) => void {
  const {
    pickerMode,
    rows,
    moveWorld,
    pickerIds,
    onRowMove,
    onBulkPickUp,
    setPickerOpen,
    setPlanWorld,
    setMoveTarget,
    setMoveSheetOpen,
  } = input;
  const activeRowId = pickerMode === 'row' ? (pickerIds[0] ?? null) : null;
  return (target: PlacementTarget): void => {
    setPickerOpen(false);
    if (pickerMode === 'row' && activeRowId !== null) {
      onRowMove(
        activeRowId,
        rows.find((row) => row.id === activeRowId)?.name ?? 'item',
        target,
        moveWorld
      );
      return;
    }
    if (target.kind === 'in-hand') {
      void onBulkPickUp(pickerIds);
      return;
    }
    setPlanWorld(moveWorld);
    setMoveTarget(target);
    setMoveSheetOpen(true);
  };
}

/** Binds picker subjects, safe anchors, move worlds, and move plans. */
export function usePlacementController(input: {
  rows: readonly ItemRowModel[];
  onBulkPickUp: (ids: readonly string[]) => Promise<void>;
  onRowMove: (id: string, itemName: string, target: PlacementTarget, world: PlacementWorld) => void;
}) {
  const dockAnchorRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>('bulk');
  const [pickerIds, setPickerIds] = useState<readonly string[]>([]);
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });
  const [moveTarget, setMoveTarget] = useState<PlacementTarget | null>(null);
  const [planWorld, setPlanWorld] = useState<PlacementWorld | null>(null);
  const [moveSheetOpen, setMoveSheetOpen] = useState(false);
  const { pickerSubject, sources, moveWorld } = usePlacementData(input.rows, pickerOpen, pickerIds);
  const movePlan =
    moveTarget === null || planWorld === null
      ? null
      : planMove({ world: planWorld, selectedIds: pickerIds, target: moveTarget });
  const openPicker = useCallback(
    (ids: readonly string[], mode: PickerMode, explicit?: Element | null): void => {
      setPickerIds([...ids]);
      setPickerMode(mode);
      setMoveTarget(null);
      setPlanWorld(null);
      setMoveSheetOpen(false);
      setAnchor(resolveAnchor(mode, explicit, dockAnchorRef));
      setPickerOpen(true);
    },
    []
  );
  const onPickerPick = pickerHandler({
    pickerMode,
    rows: input.rows,
    moveWorld,
    pickerIds,
    onRowMove: input.onRowMove,
    onBulkPickUp: input.onBulkPickUp,
    setPickerOpen,
    setPlanWorld,
    setMoveTarget,
    setMoveSheetOpen,
  });
  return {
    dockAnchorRef,
    pickerOpen,
    setPickerOpen,
    pickerSubject,
    pickerIds,
    anchor,
    moveWorld,
    planWorld,
    movePlan,
    moveSheetOpen,
    setMoveSheetOpen,
    sources,
    openPicker,
    onPickerPick,
  };
}

/** Props for the controlled bulk move confirmation sheet. */
export interface BulkMoveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: MovePlan;
  world: PlacementWorld;
  busy: boolean;
  onApply: () => void;
  onChangeTarget: () => void;
}

/** Presents a controlled confirmation sheet for a planned bulk move. */
export function BulkMoveSheet({
  open,
  onOpenChange,
  plan,
  world,
  busy,
  onApply,
  onChangeTarget,
}: BulkMoveSheetProps): ReactElement {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Move ${plan.moving.length + plan.alreadyThere.length + plan.blocked.length} selected`}
      description="Containers take their contents with them."
    >
      <MovePlanPanel
        plan={plan}
        world={world}
        onApply={onApply}
        onCancel={() => onOpenChange(false)}
        onChangeTarget={onChangeTarget}
        busy={busy}
      />
    </Sheet>
  );
}
