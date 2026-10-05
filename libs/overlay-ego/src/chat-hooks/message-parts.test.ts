import { describe, expect, it } from 'vitest';

import { parseMessagePart, parseMessageParts } from './message-parts';
import { parseStreamFrame } from './stream-frames';

const action = {
  actionId: 'a1',
  tool: 'inventory_items_create',
  summary: 'Add a drill',
  status: 'pending',
};
const actionsPart = { type: 'actions', batchId: 'b1', actions: [action] };
const frame = (value: unknown): string => `data: ${JSON.stringify(value)}`;

describe('parseMessagePart', () => {
  it('accepts a text part', () => {
    expect(parseMessagePart({ type: 'text', text: 'hi' })).toEqual({ type: 'text', text: 'hi' });
  });

  it('accepts an entity part and keeps a string subtitle', () => {
    const part = {
      type: 'entity',
      uri: 'pops:inventory/item/1',
      title: 'Drill',
      subtitle: 'Garage',
    };
    expect(parseMessagePart(part)).toEqual(part);
  });

  it('drops a non-string subtitle without rejecting the part', () => {
    const parsed = parseMessagePart({
      type: 'entity',
      uri: 'pops:inventory/item/1',
      title: 'Drill',
      subtitle: 4,
    });
    expect(parsed).toEqual({ type: 'entity', uri: 'pops:inventory/item/1', title: 'Drill' });
    expect(parsed).not.toHaveProperty('subtitle');
  });

  it('accepts an actions part', () => {
    expect(parseMessagePart(actionsPart)).toEqual(actionsPart);
  });

  it.each([
    ['entity without uri', { type: 'entity', title: 'Drill' }],
    ['entity with numeric title', { type: 'entity', uri: 'pops:a/b/c', title: 1 }],
    ['text without text', { type: 'text' }],
    [
      'actions entry with status done',
      { ...actionsPart, actions: [{ ...action, status: 'done' }] },
    ],
    [
      'actions with one bad entry among good ones',
      { ...actionsPart, actions: [action, { ...action, tool: 3 }] },
    ],
    ['actions with a non-object entry', { ...actionsPart, actions: [action, 'x'] }],
    ['actions with empty array', { ...actionsPart, actions: [] }],
    ['actions without batchId', { type: 'actions', actions: [action] }],
    ['actions with empty batchId', { ...actionsPart, batchId: '' }],
    ['unknown type chart', { type: 'chart', data: [] }],
    ['a string', 'text'],
    ['null', null],
    ['an array', [actionsPart]],
  ])('rejects %s', (_label, raw) => {
    expect(parseMessagePart(raw)).toBeNull();
  });
});

describe('parseMessageParts', () => {
  it('returns an empty array for non-arrays', () => {
    expect(parseMessageParts(null)).toEqual([]);
    expect(parseMessageParts('x')).toEqual([]);
    expect(parseMessageParts({ type: 'text', text: 'a' })).toEqual([]);
  });

  it('keeps only valid parts in their original order', () => {
    const parts = parseMessageParts([
      { type: 'text', text: 'one' },
      { type: 'chart' },
      actionsPart,
      null,
      { type: 'entity', uri: 'pops:a/b/c', title: 'T' },
    ]);
    expect(parts.map((part) => part.type)).toEqual(['text', 'actions', 'entity']);
  });
});

describe('parseStreamFrame', () => {
  it('accepts a token frame', () => {
    expect(parseStreamFrame(frame({ type: 'token', text: 'a' }))).toEqual({
      type: 'token',
      text: 'a',
    });
  });

  it('accepts a tool frame', () => {
    expect(
      parseStreamFrame(frame({ type: 'tool', name: 'finance_search', status: 'started' }))
    ).toEqual({
      type: 'tool',
      name: 'finance_search',
      status: 'started',
    });
  });

  it('accepts a part frame', () => {
    expect(parseStreamFrame(frame({ type: 'part', part: actionsPart }))).toEqual({
      type: 'part',
      part: actionsPart,
    });
  });

  it('accepts a navigate frame', () => {
    expect(
      parseStreamFrame(frame({ type: 'navigate', uri: 'pops:finance/transaction/9' }))
    ).toEqual({
      type: 'navigate',
      uri: 'pops:finance/transaction/9',
    });
  });

  it('accepts a full done frame and filters invalid engrams', () => {
    const parsed = parseStreamFrame(
      frame({
        type: 'done',
        conversationId: 'c1',
        messageId: 'm1',
        retrievedEngrams: [
          { engramId: 'e1', relevanceScore: 0.5 },
          { engramId: 'e2' },
          { engramId: 3, relevanceScore: 1 },
        ],
        parts: [{ type: 'text', text: 'hi' }],
      })
    );
    expect(parsed).toEqual({
      type: 'done',
      conversationId: 'c1',
      messageId: 'm1',
      retrievedEngrams: [{ engramId: 'e1', relevanceScore: 0.5 }],
      parts: [{ type: 'text', text: 'hi' }],
    });
  });

  it('accepts an error frame', () => {
    expect(parseStreamFrame(frame({ type: 'error', message: 'boom' }))).toEqual({
      type: 'error',
      message: 'boom',
    });
  });

  it('defaults an error frame without message', () => {
    expect(parseStreamFrame(frame({ type: 'error' }))).toEqual({
      type: 'error',
      message: 'Stream failed',
    });
  });

  it('returns null for malformed JSON', () => {
    expect(parseStreamFrame('data: {nope')).toBeNull();
  });

  it('returns null without the data prefix', () => {
    expect(parseStreamFrame(JSON.stringify({ type: 'token', text: 'a' }))).toBeNull();
  });

  it('returns null for a non-object payload', () => {
    expect(parseStreamFrame('data: 5')).toBeNull();
    expect(parseStreamFrame('data: null')).toBeNull();
    expect(parseStreamFrame('data: []')).toBeNull();
  });

  it.each([
    ['unknown frame type', { type: 'telepathy' }],
    ['tool status running', { type: 'tool', name: 'x', status: 'running' }],
    ['tool without name', { type: 'tool', status: 'started' }],
    ['token without text', { type: 'token' }],
    ['navigate without uri', { type: 'navigate' }],
    [
      'part frame with invalid part',
      { type: 'part', part: { type: 'actions', batchId: 'b', actions: [] } },
    ],
    ['part frame without part', { type: 'part' }],
    ['done without conversationId', { type: 'done', messageId: 'm', parts: [] }],
  ])('returns null for %s', (_label, raw) => {
    expect(parseStreamFrame(frame(raw))).toBeNull();
  });

  it('keeps good parts of a done frame that has a bad one', () => {
    const parsed = parseStreamFrame(
      frame({
        type: 'done',
        conversationId: 'c1',
        parts: [{ type: 'bogus' }, { type: 'text', text: 'ok' }],
      })
    );
    expect(parsed).toMatchObject({ type: 'done', parts: [{ type: 'text', text: 'ok' }] });
  });

  it('parses a bare done frame to empty collections and a null messageId', () => {
    expect(parseStreamFrame(frame({ type: 'done', conversationId: 'c1' }))).toEqual({
      type: 'done',
      conversationId: 'c1',
      messageId: null,
      retrievedEngrams: [],
      parts: [],
    });
  });
});
