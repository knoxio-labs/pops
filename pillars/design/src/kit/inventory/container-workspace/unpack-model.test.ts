import { describe, expect, it } from 'vitest';

import { exitRefusal, initialUnpack, unpackProgress, unpackReducer } from './unpack-model';

import type { UnpackAction, UnpackState } from './unpack-model';

const run = (state: UnpackState, ...actions: UnpackAction[]): UnpackState =>
  actions.reduce(unpackReducer, state);

const openBox = initialUnpack(['a', 'b', 'c'], 'open');
const closedBox = initialUnpack(['a', 'b', 'c'], 'closed');
const out = (ids: string[], how: 'take-out' | 'move' | 'pick-up' = 'take-out'): UnpackAction => ({
  type: 'exit',
  ids,
  how,
});

describe('unpackReducer starting', () => {
  it('starts unpacking an open container with contents', () => {
    expect(run(openBox, { type: 'start' }).phase).toBe('unpacking');
  });

  it('goes straight to the outcome question for an empty open container', () => {
    expect(run(initialUnpack([], 'open'), { type: 'start' }).phase).toBe('emptied');
  });

  it('refuses to start on a closed container', () => {
    expect(run(closedBox, { type: 'start' })).toBe(closedBox);
  });
});

describe('unpackReducer taking things out', () => {
  it('removes what left, keeps list order, and records how', () => {
    const next = run(openBox, { type: 'start' }, out(['b'], 'move'));
    expect(next.inside).toEqual(['a', 'c']);
    expect(next.out).toEqual([{ id: 'b', how: 'move' }]);
    expect(next.phase).toBe('unpacking');
  });

  it('ignores ids that are not inside and changes nothing when none are', () => {
    const started = run(openBox, { type: 'start' });
    expect(run(started, out(['zzz']))).toBe(started);
    expect(run(started, out(['a', 'zzz'])).out).toEqual([{ id: 'a', how: 'take-out' }]);
  });

  it('refuses every way out of a closed container', () => {
    expect(run(closedBox, out(['a']))).toBe(closedBox);
    expect(run(closedBox, out(['a'], 'pick-up'))).toBe(closedBox);
  });

  it('asks the outcome question when the last thing leaves while unpacking', () => {
    const next = run(openBox, { type: 'start' }, out(['a', 'b']), out(['c'], 'pick-up'));
    expect(next.phase).toBe('emptied');
    expect(unpackProgress(next)).toEqual({ out: 3, total: 3 });
  });

  it('does not ask when things leave outside an unpack', () => {
    expect(run(openBox, out(['a', 'b', 'c'])).phase).toBe('browse');
  });
});

describe('unpackReducer closing part way', () => {
  it('pauses as closed-partial when closed with things still inside', () => {
    const next = run(openBox, { type: 'start' }, out(['a']), { type: 'close' });
    expect(next).toMatchObject({ phase: 'closed-partial', access: 'closed' });
    expect(unpackProgress(next)).toEqual({ out: 1, total: 3 });
  });

  it('resumes unpacking when reopened', () => {
    const next = run(openBox, { type: 'start' }, out(['a']), { type: 'close' }, { type: 'open' });
    expect(next).toMatchObject({ phase: 'unpacking', access: 'open' });
  });

  it('closes a container at rest without entering any unpack phase', () => {
    expect(run(openBox, { type: 'close' })).toMatchObject({ phase: 'browse', access: 'closed' });
  });

  it('finishing an unpack early returns to browsing with the rest still inside', () => {
    const next = run(openBox, { type: 'start' }, out(['a']), { type: 'finish' });
    expect(next).toMatchObject({ phase: 'browse', inside: ['b', 'c'] });
  });
});

describe('unpackReducer outcome', () => {
  const emptied = run(openBox, { type: 'start' }, out(['a', 'b', 'c']));

  it('keeps the empty container', () => {
    expect(run(emptied, { type: 'keep' }).phase).toBe('kept');
  });

  it('asks inline before retiring, and can back out', () => {
    const asking = run(emptied, { type: 'ask-retire' });
    expect(asking.phase).toBe('confirm-retire');
    expect(run(asking, { type: 'cancel-retire' }).phase).toBe('emptied');
    expect(run(asking, { type: 'retire' }).phase).toBe('retired');
  });

  it('ignores outcome actions outside their phase', () => {
    expect(run(openBox, { type: 'retire' })).toBe(openBox);
    expect(run(emptied, { type: 'retire' })).toBe(emptied);
    expect(run(openBox, { type: 'keep' })).toBe(openBox);
  });
});

describe('exitRefusal', () => {
  it('names why nothing can leave', () => {
    expect(exitRefusal(closedBox, 'Kitchen 12')).toBe(
      'Kitchen 12 is closed. Open it to take things out.'
    );
    expect(exitRefusal(initialUnpack([], 'open'), 'Kitchen 12')).toBe('Kitchen 12 is empty.');
    expect(exitRefusal(openBox, 'Kitchen 12')).toBeNull();
  });
});
