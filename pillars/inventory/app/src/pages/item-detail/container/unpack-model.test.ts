import { describe, expect, it } from 'vitest';

import { exitRefusal, initialUnpack, unpackProgress, unpackReducer } from './unpack-model.js';

describe('unpackReducer', () => {
  it('keeps a closed container paused and refuses a new unpack', () => {
    const closed = initialUnpack(['a', 'b'], 'closed');

    expect(unpackReducer(closed, { type: 'start' })).toEqual(closed);
    expect(exitRefusal(closed, 'Archive box')).toBe(
      'Archive box is closed. Open it to take things out.'
    );
  });

  it('starts an open flow, preserves direct-content order, and ends on the last exit', () => {
    const started = unpackReducer(initialUnpack(['a', 'b', 'c'], 'open'), { type: 'start' });
    const partial = unpackReducer(started, {
      type: 'exit',
      ids: ['c', 'missing', 'a'],
      how: 'take-out',
    });
    const emptied = unpackReducer(partial, { type: 'exit', ids: ['b'], how: 'pick-up' });

    expect(partial).toEqual({
      phase: 'unpacking',
      access: 'open',
      inside: ['b'],
      out: [
        { id: 'c', how: 'take-out' },
        { id: 'a', how: 'take-out' },
      ],
    });
    expect(emptied.phase).toBe('emptied');
    expect(unpackProgress(emptied)).toEqual({ out: 3, total: 3 });
  });

  it('pauses only a partial unpack and resumes it after opening', () => {
    const started = unpackReducer(initialUnpack(['a', 'b'], 'open'), { type: 'start' });
    const partial = unpackReducer(
      unpackReducer(started, { type: 'exit', ids: ['a'], how: 'move' }),
      { type: 'close' }
    );

    expect(partial.phase).toBe('closed-partial');
    expect(partial.access).toBe('closed');
    expect(unpackReducer(partial, { type: 'exit', ids: ['b'], how: 'pick-up' })).toEqual(partial);
    expect(unpackReducer(partial, { type: 'open' }).phase).toBe('unpacking');
  });

  it('can stop for now without changing the direct contents', () => {
    const started = unpackReducer(initialUnpack(['a'], 'open'), { type: 'start' });
    const stopped = unpackReducer(started, { type: 'finish' });

    expect(stopped.phase).toBe('browse');
    expect(stopped.inside).toEqual(['a']);
    expect(unpackReducer(stopped, { type: 'finish' })).toEqual(stopped);
  });

  it('guards the empty-container outcome and restores an optimistic retirement', () => {
    let state = unpackReducer(initialUnpack([], 'open'), { type: 'start' });
    expect(state.phase).toBe('emptied');
    state = unpackReducer(state, { type: 'ask-retire' });
    expect(state.phase).toBe('confirm-retire');
    state = unpackReducer(state, { type: 'retire' });
    expect(state.phase).toBe('retired');
    state = unpackReducer(state, { type: 'restore-retired' });
    expect(state.phase).toBe('emptied');
    expect(unpackReducer(state, { type: 'keep' }).phase).toBe('kept');
    expect(unpackReducer(state, { type: 'cancel-retire' })).toEqual(state);
  });

  it('restores refused exits and returns to unpacking from the empty boundary', () => {
    let state = unpackReducer(initialUnpack(['a'], 'open'), { type: 'start' });
    state = unpackReducer(state, { type: 'exit', ids: ['a'], how: 'take-out' });
    state = unpackReducer(state, { type: 'restore', ids: ['a'] });

    expect(state.phase).toBe('unpacking');
    expect(state.inside).toEqual(['a']);
    expect(state.out).toEqual([]);
    expect(exitRefusal(state, 'Archive box')).toBeNull();
  });

  it('adopts later pages without resurrecting an optimistic exit', () => {
    let state = initialUnpack(['one'], 'open');
    state = unpackReducer(state, { type: 'start' });
    state = unpackReducer(state, { type: 'exit', ids: ['one'], how: 'take-out' });
    state = unpackReducer(state, { type: 'sync', ids: ['one', 'two', 'three'] });

    expect(state.inside).toEqual(['two', 'three']);
    expect(state.out).toEqual([{ id: 'one', how: 'take-out' }]);
    expect(state.phase).toBe('unpacking');
  });
});
