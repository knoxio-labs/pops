import { describe, expect, it } from 'vitest';

import { createInboxState } from './fixture';
import {
  createInboxTarget,
  inboxSourceRow,
  inboxTargetKinds,
  emptyInboxTargetDraft,
  unlinkInboxAssociation,
  type InboxNewTargetDraft,
} from './model';

const draft: InboxNewTargetDraft = {
  ...emptyInboxTargetDraft(createInboxState()),
  kind: 'event',
  title: 'Explicitly entered event',
  placeId: '',
  visitId: '',
  notes: 'Ask about access.',
};

describe('explicit new-item organisation', () => {
  it('takes visible lifecycle defaults from data and preserves explicitly selected alternatives without auto-purchase', () => {
    const state = createInboxState();
    state.creationDefaults = { intention: 'Alternative', arrangement: 'Not needed' };
    const initial = emptyInboxTargetDraft(state);
    expect(initial).toMatchObject(state.creationDefaults);
    const selected = {
      ...initial,
      kind: 'stay',
      title: 'Explicit stay',
      intention: 'In plan',
      arrangement: 'Booked',
    };
    const result = createInboxTarget(state, 'capture-recife-note', selected, {
      targetId: 'new-stay',
      associationId: 'new-stay-link',
    });
    expect(result.error).toBeNull();
    expect(result.state.targets.at(-1)).toMatchObject({
      intention: 'In plan',
      arrangement: 'Booked',
    });
    expect(result.state.targets.at(-1)).not.toHaveProperty('purchase');
    expect(state.creationDefaults).toEqual({ intention: 'Alternative', arrangement: 'Not needed' });
    expect(result.state.routeOrder).toBe(state.routeOrder);
  });

  it('creates only user-entered typed fields, without inferring dates, location, agreement, purchase or route membership', () => {
    const state = createInboxState();
    const source = state.capture.items[0];
    if (!source) throw new Error('Missing captured source');
    const before = structuredClone(state);
    const result = createInboxTarget(state, source.id, draft, {
      targetId: 'new-event',
      associationId: 'new-association',
    });
    expect(result.error).toBeNull();
    expect(result.state.targets.at(-1)).toEqual({
      id: 'new-event',
      kind: 'event',
      title: draft.title,
      placeId: '',
      notes: draft.notes,
      intention: 'Considering',
      arrangement: 'Not arranged',
    });
    expect(result.state.targets.at(-1)).not.toHaveProperty('schedule');
    expect(result.state.targets.at(-1)).not.toHaveProperty('purchase');
    expect(result.state.routeOrder).toBe(state.routeOrder);
    expect(result.state.capture).toBe(state.capture);
    expect(inboxSourceRow(result.state, source.id)?.source).toBe(source);
    expect(state).toEqual(before);
  });

  it.each(inboxTargetKinds)(
    'creates an explicitly selected $id with optional source location and visit',
    ({ id }) => {
      const state = createInboxState();
      const source = state.capture.items[0];
      if (!source) throw new Error('Missing captured source');
      const result = createInboxTarget(
        state,
        source.id,
        { ...draft, kind: id, placeId: 'recife-olinda', visitId: 'recife' },
        { targetId: `new-${id}`, associationId: `association-${id}` }
      );
      expect(result.error).toBeNull();
      expect(result.state.targets.at(-1)).toMatchObject({
        kind: id,
        placeId: 'recife-olinda',
        visitId: 'recife',
      });
      expect(result.state.routeOrder).not.toContain(`new-${id}`);
    }
  );

  it.each([
    { kind: '' },
    { kind: 'unsupported' },
    { title: ' ' },
    { placeId: 'unknown' },
    { visitId: 'unknown' },
    { visitId: 'walk' },
    { intention: '' },
    { arrangement: 'unsupported' },
  ])('rejects invalid explicitly selected target fields %j atomically', (patch) => {
    const state = createInboxState();
    const result = createInboxTarget(
      state,
      'capture-recife-note',
      { ...draft, ...patch },
      { targetId: 'new', associationId: 'new-link' }
    );
    expect(result.state).toBe(state);
    expect(result.error).not.toBeNull();
  });

  it.each([
    ['missing-source', 'new', 'new-link'],
    ['capture-recife-note', '', 'new-link'],
    ['capture-recife-note', 'walk', 'new-link'],
    ['capture-recife-note', 'removed-target', 'new-link'],
    ['capture-recife-note', 'new', 'missing-target'],
  ] as const)(
    'rejects stale source or reserved identity %s %s %s',
    (sourceId, targetId, associationId) => {
      const state = createInboxState('missing-reference');
      const result = createInboxTarget(state, sourceId, draft, { targetId, associationId });
      expect(result.state).toBe(state);
      expect(result.error).not.toBeNull();
    }
  );

  it('preserves same-title targets by identity and retains the created target after unlink for undo', () => {
    const state = createInboxState('duplicate-names');
    const source = state.capture.items[0];
    if (!source) throw new Error('Missing captured source');
    const result = createInboxTarget(
      state,
      source.id,
      { ...draft, title: 'Walk together' },
      { targetId: 'new-walk', associationId: 'new-walk-link' }
    );
    expect(result.state.targets.filter((target) => target.title === 'Walk together')).toHaveLength(
      3
    );
    const removed = unlinkInboxAssociation(result.state, 'new-walk-link');
    expect(removed.targets).toBe(result.state.targets);
    expect(inboxSourceRow(removed, source.id)?.organised).toBe(false);
    expect(inboxSourceRow(result.state, source.id)?.organised).toBe(true);
    expect(state.associations).toEqual([]);
  });
});
