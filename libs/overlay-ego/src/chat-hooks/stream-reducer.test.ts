import { describe, expect, it } from 'vitest';

import {
  INITIAL_STREAM_STATE,
  reduceStreamFrame,
  STREAM_START_STATE,
  type StreamState,
} from './stream-reducer';

describe('stream state reducer', () => {
  it('defines idle and active stream states', () => {
    expect(INITIAL_STREAM_STATE).toEqual({ content: null, tools: [], parts: [] });
    expect(STREAM_START_STATE).toEqual({ content: '', tools: [], parts: [] });
  });

  it('appends tokens and starts content from null', () => {
    const first = reduceStreamFrame(INITIAL_STREAM_STATE, { type: 'token', text: 'hello' });
    const second = reduceStreamFrame(first, { type: 'token', text: ' world' });

    expect(first.content).toBe('hello');
    expect(second.content).toBe('hello world');
  });

  it('finishes the most recent started entry for the same tool', () => {
    const first = reduceStreamFrame(STREAM_START_STATE, {
      type: 'tool',
      name: 'lookup',
      status: 'started',
    });
    const second = reduceStreamFrame(first, { type: 'tool', name: 'lookup', status: 'started' });
    const finished = reduceStreamFrame(second, {
      type: 'tool',
      name: 'lookup',
      status: 'finished',
    });

    expect(finished.tools).toEqual([
      { name: 'lookup', status: 'started' },
      { name: 'lookup', status: 'finished' },
    ]);
  });

  it('appends a finished entry when no matching tool is still started', () => {
    const state: StreamState = {
      ...STREAM_START_STATE,
      tools: [{ name: 'other', status: 'started' }],
    };

    expect(
      reduceStreamFrame(state, { type: 'tool', name: 'lookup', status: 'finished' }).tools
    ).toEqual([
      { name: 'other', status: 'started' },
      { name: 'lookup', status: 'finished' },
    ]);
  });

  it('records a started tool as failed', () => {
    const started = reduceStreamFrame(STREAM_START_STATE, {
      type: 'tool',
      name: 'lookup',
      status: 'started',
    });

    expect(
      reduceStreamFrame(started, { type: 'tool', name: 'lookup', status: 'failed' }).tools
    ).toEqual([{ name: 'lookup', status: 'failed' }]);
  });

  it('keeps streamed parts in arrival order', () => {
    const withFirst = reduceStreamFrame(STREAM_START_STATE, {
      type: 'part',
      part: { type: 'text', text: 'first' },
    });
    const withSecond = reduceStreamFrame(withFirst, {
      type: 'part',
      part: { type: 'entity', uri: 'pops:inventory/item/1', title: 'Drill' },
    });

    expect(withSecond.parts.map((part) => part.type)).toEqual(['text', 'entity']);
  });

  it('resets all accumulated data after an error', () => {
    const withToken = reduceStreamFrame(STREAM_START_STATE, { type: 'token', text: 'reply' });
    const withTool = reduceStreamFrame(withToken, {
      type: 'tool',
      name: 'lookup',
      status: 'started',
    });
    const withPart = reduceStreamFrame(withTool, {
      type: 'part',
      part: { type: 'text', text: 'part' },
    });

    expect(reduceStreamFrame(withPart, { type: 'error', message: 'failed' })).toEqual(
      INITIAL_STREAM_STATE
    );
  });

  it('returns the same state for done and navigate frames', () => {
    const state: StreamState = { ...STREAM_START_STATE, content: 'reply' };
    const done = {
      type: 'done' as const,
      conversationId: 'c1',
      messageId: 'm1',
      retrievedEngrams: [],
      parts: [],
    };

    expect(reduceStreamFrame(state, done)).toBe(state);
    expect(reduceStreamFrame(state, { type: 'navigate', uri: 'pops:inventory/item/1' })).toBe(
      state
    );
  });

  it('does not mutate frozen state or arrays', () => {
    const state: StreamState = {
      content: 'reply',
      tools: [{ name: 'lookup', status: 'started' }],
      parts: [{ type: 'text', text: 'part' }],
    };
    const snapshot = {
      content: state.content,
      tools: [...state.tools],
      parts: [...state.parts],
    };
    Object.freeze(state.tools[0]);
    Object.freeze(state.parts[0]);
    Object.freeze(state.tools);
    Object.freeze(state.parts);
    Object.freeze(state);

    const next = reduceStreamFrame(state, {
      type: 'part',
      part: { type: 'text', text: 'new part' },
    });

    expect(state).toEqual(snapshot);
    expect(next.parts).toEqual([...snapshot.parts, { type: 'text', text: 'new part' }]);
  });
});
