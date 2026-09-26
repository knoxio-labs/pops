/**
 * Moving day's state: the world (every change undoable), which view is
 * showing, the find query, the box open in the side panel, and the things
 * waiting for the picker to say which box they go in.
 */
import { useCallback, useMemo, useState } from 'react';

import { planMove, showUndoToast } from '../foundation';
import { applyMove } from '../locations-tree/apply-move';
import { actionMessage, applyBoxAction } from './box-actions';
import { boxStage, summariseMove } from './moving-model';

import type { PlacementTarget, PlacementWorld } from '../foundation';
import type { BoxAction } from './box-actions';
import type { MovingSummary } from './moving-model';

/** The three ways to look at the move. */
export type MovingView = 'boxes' | 'destinations' | 'loose';

/** Where a review state opens. */
export interface MovingSeed {
  world: PlacementWorld;
  homeId: string;
  destinations: ReadonlyMap<string, string | null>;
  view?: MovingView;
  query?: string;
  openBoxId?: string | null;
}

/** What {@link useMovingDay} hands the page. */
export interface MovingDayApi {
  world: PlacementWorld;
  summary: MovingSummary;
  view: MovingView;
  setView: (view: MovingView) => void;
  query: string;
  setQuery: (query: string) => void;
  openBoxId: string | null;
  setOpenBoxId: (id: string | null) => void;
  packing: readonly string[] | null;
  startPacking: (ids: readonly string[]) => void;
  cancelPacking: () => void;
  /** Puts `ids` in a box (or wherever the picker chose). */
  putIn: (ids: readonly string[], target: PlacementTarget) => void;
  act: (boxId: string, action: BoxAction) => void;
}

const ACTION_CONCEPT = { close: 'closed', 'mark-full': 'full', open: 'open' } as const;

function things(count: number): string {
  return count === 1 ? '1 thing' : `${count} things`;
}

/** Moving-day state. */
export function useMovingDay(seed: MovingSeed): MovingDayApi {
  const [world, setWorld] = useState(seed.world);
  const [view, setView] = useState<MovingView>(seed.view ?? 'boxes');
  const [query, setQuery] = useState(seed.query ?? '');
  const [openBoxId, setOpenBoxId] = useState(seed.openBoxId ?? null);
  const [packing, setPacking] = useState<readonly string[] | null>(null);
  const summary = useMemo(
    () => summariseMove(world, seed.homeId, seed.destinations),
    [world, seed.homeId, seed.destinations]
  );
  const commit = useCallback(
    (next: PlacementWorld, concept: 'move' | 'closed' | 'full' | 'open', message: string) => {
      if (next === world) return;
      const before = world;
      setWorld(next);
      showUndoToast({ concept, message, onUndo: () => setWorld(before) });
    },
    [world]
  );
  const putIn = useCallback(
    (ids: readonly string[], target: PlacementTarget) => {
      const plan = planMove({ world, selectedIds: ids, target });
      const name = plan.targetName;
      commit(applyMove(world, plan), 'move', `Packed ${things(plan.moving.length)} into ${name}`);
      setPacking(null);
    },
    [world, commit]
  );
  const act = useCallback(
    (boxId: string, action: BoxAction) => {
      const box = world.items.get(boxId);
      if (box === undefined) return;
      const stage = boxStage(box);
      const concept = ACTION_CONCEPT[action];
      commit(applyBoxAction(world, boxId, action), concept, actionMessage(action, box.name, stage));
    },
    [world, commit]
  );
  return {
    world,
    summary,
    view,
    setView,
    query,
    setQuery,
    openBoxId,
    setOpenBoxId,
    packing,
    startPacking: setPacking,
    cancelPacking: () => setPacking(null),
    putIn,
    act,
  };
}
