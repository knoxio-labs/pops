/**
 * The three things a box's packing stage changes by: mark it full, close
 * it, open it again. Each is one reversible event, so each lands at once
 * with Undo rather than asking.
 */

import { buildWorld } from '../foundation';

import type { ContainerFacts, PlacementWorld } from '../foundation';
import type { BoxStage } from './moving-model';

/** A stage change. */
export type BoxAction = 'mark-full' | 'close' | 'open';

/** The verbs a box in `stage` offers, primary first. */
export function actionsFor(stage: BoxStage): BoxAction[] {
  if (stage === 'packing') return ['mark-full', 'close'];
  if (stage === 'full') return ['close', 'open'];
  return ['open'];
}

/** Button words for each action. `open` on a full box means "not full after all". */
export function actionLabel(action: BoxAction, stage: BoxStage): string {
  if (action === 'mark-full') return 'Mark full';
  if (action === 'close') return 'Close box';
  return stage === 'full' ? 'Not full' : 'Reopen';
}

function facts(action: BoxAction, current: ContainerFacts): ContainerFacts {
  if (action === 'mark-full') return { ...current, full: true };
  if (action === 'close') return { access: 'closed', full: current.full };
  return current.access === 'closed'
    ? { access: 'open', full: current.full }
    : { ...current, full: false };
}

/** The world after `action` on box `id`. Anything that is not a box is left alone. */
export function applyBoxAction(
  world: PlacementWorld,
  id: string,
  action: BoxAction
): PlacementWorld {
  const box = world.items.get(id);
  if (box === undefined || box.container === null) return world;
  const next = { ...box, container: facts(action, box.container) };
  const items = [...world.items.values()].map((entry) => (entry.id === id ? next : entry));
  return buildWorld(items, [...world.locations.values()]);
}

/** The toast line for an action. */
export function actionMessage(action: BoxAction, name: string, stage: BoxStage): string {
  if (action === 'mark-full') return `Marked ${name} full`;
  if (action === 'close') return `Closed ${name}`;
  return stage === 'full' ? `Marked ${name} not full` : `Reopened ${name}`;
}
