import { movingWorld } from '@/fixtures/inventory/moving-day';
import { describe, expect, it } from 'vitest';

import { actionLabel, actionMessage, actionsFor, applyBoxAction } from './box-actions';
import { boxStage } from './moving-model';

const stageOf = (world: typeof movingWorld, id: string) => {
  const box = world.items.get(id);
  if (box === undefined) throw new Error(id);
  return boxStage(box);
};

describe('actionsFor', () => {
  it('offers the next step first', () => {
    expect(actionsFor('packing')).toEqual(['mark-full', 'close']);
    expect(actionsFor('full')).toEqual(['close', 'open']);
    expect(actionsFor('closed')).toEqual(['open']);
  });
});

describe('applyBoxAction', () => {
  it('walks a box from packing to full to closed', () => {
    expect(stageOf(movingWorld, 'mv-k04')).toBe('packing');
    const full = applyBoxAction(movingWorld, 'mv-k04', 'mark-full');
    expect(stageOf(full, 'mv-k04')).toBe('full');
    const closed = applyBoxAction(full, 'mv-k04', 'close');
    expect(closed.items.get('mv-k04')?.container).toEqual({ access: 'closed', full: true });
  });

  it('reopens a closed box keeping full, and clears full on an open one', () => {
    const reopened = applyBoxAction(movingWorld, 'mv-k01', 'open');
    expect(reopened.items.get('mv-k01')?.container).toEqual({ access: 'open', full: true });
    const notFull = applyBoxAction(movingWorld, 'mv-k03', 'open');
    expect(notFull.items.get('mv-k03')?.container).toEqual({ access: 'open', full: false });
  });

  it('leaves the world alone for something that is not a box', () => {
    expect(applyBoxAction(movingWorld, 'mv-k01-0', 'close')).toBe(movingWorld);
    expect(applyBoxAction(movingWorld, 'nope', 'close')).toBe(movingWorld);
  });
});

describe('words', () => {
  it('says what each action does in its context', () => {
    expect(actionLabel('open', 'full')).toBe('Not full');
    expect(actionLabel('open', 'closed')).toBe('Reopen');
    expect(actionLabel('close', 'packing')).toBe('Close box');
    expect(actionMessage('open', 'Kitchen 03', 'full')).toBe('Marked Kitchen 03 not full');
    expect(actionMessage('close', 'Kitchen 03', 'full')).toBe('Closed Kitchen 03');
  });
});
