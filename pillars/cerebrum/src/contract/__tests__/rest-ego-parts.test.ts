import { describe, expect, it } from 'vitest';

import {
  egoActionsPartSchema,
  egoEntityPartSchema,
  egoMessagePartSchema,
  egoTextPartSchema,
  parseObjectUri,
} from '../rest-ego-parts.js';
import { egoStreamBodySchema, egoStreamFrameSchema } from '../rest-ego-stream.js';

const action = {
  actionId: 'a1',
  tool: 'inventory_items_create',
  summary: 'Add a drill',
  status: 'pending',
};
const actionsPart = { type: 'actions', batchId: 'b1', actions: [action] };
const entityPart = { type: 'entity', uri: 'pops:finance/transaction/tx_1', title: 'Coffee' };
const doneFrame = {
  type: 'done',
  conversationId: 'c1',
  messageId: 'm1',
  citations: ['eng_1'],
  tokensIn: 10,
  tokensOut: 20,
  retrievedEngrams: [{ engramId: 'eng_1', relevanceScore: 0.5 }],
  scopeNegotiation: { scopes: ['personal'], changed: false, reason: null, secretNotice: null },
  parts: [{ type: 'text', text: 'hi' }, entityPart, actionsPart],
};

const badUris = [
  'pops:finance/transaction',
  'pops:Finance/transaction/tx_1',
  'finance/transaction/tx_1',
  'pops:finance/transaction/a/b',
  '',
];

describe('parseObjectUri', () => {
  it('returns the three segments', () => {
    expect(parseObjectUri('pops:finance/transaction/tx_1')).toEqual({
      domain: 'finance',
      type: 'transaction',
      id: 'tx_1',
    });
  });

  it.each(badUris)('returns null for %j', (uri) => {
    expect(parseObjectUri(uri)).toBeNull();
  });

  it('returns null for an id containing whitespace', () => {
    expect(parseObjectUri('pops:finance/transaction/tx 1')).toBeNull();
  });
});

describe('message parts', () => {
  it('parses each part kind', () => {
    expect(egoTextPartSchema.safeParse({ type: 'text', text: 'hi' }).success).toBe(true);
    expect(egoEntityPartSchema.safeParse({ ...entityPart, subtitle: 'Today' }).success).toBe(true);
    expect(egoActionsPartSchema.safeParse(actionsPart).success).toBe(true);
    expect(egoMessagePartSchema.safeParse(actionsPart).success).toBe(true);
  });

  it.each(badUris)('rejects an entity part with uri %j', (uri) => {
    expect(egoEntityPartSchema.safeParse({ ...entityPart, uri }).success).toBe(false);
  });

  it('rejects an entity part with an empty title', () => {
    expect(egoEntityPartSchema.safeParse({ ...entityPart, title: '' }).success).toBe(false);
  });

  it('rejects an action with an unknown status', () => {
    const part = { ...actionsPart, actions: [{ ...action, status: 'done' }] };
    expect(egoActionsPartSchema.safeParse(part).success).toBe(false);
  });

  it.each(['pending', 'confirmed', 'rejected', 'executed', 'failed'])(
    'accepts status %s',
    (status) => {
      const part = { ...actionsPart, actions: [{ ...action, status }] };
      expect(egoActionsPartSchema.safeParse(part).success).toBe(true);
    }
  );

  it('rejects an empty actions array', () => {
    expect(egoActionsPartSchema.safeParse({ ...actionsPart, actions: [] }).success).toBe(false);
  });

  it('rejects an empty batchId', () => {
    expect(egoActionsPartSchema.safeParse({ ...actionsPart, batchId: '' }).success).toBe(false);
  });
});

describe('stream frames', () => {
  const valid = [
    { type: 'token', text: 'a' },
    { type: 'tool', name: 'finance_search', status: 'started' },
    { type: 'tool', name: 'finance_search', status: 'finished' },
    { type: 'tool', name: 'finance_search', status: 'failed' },
    { type: 'part', part: entityPart },
    { type: 'navigate', uri: 'pops:finance/transaction/tx_1' },
    doneFrame,
    { type: 'error', code: 'LLM_FAILED', message: 'boom', retryable: true },
    {
      type: 'error',
      code: 'LLM_FAILED',
      message: 'boom',
      retryable: false,
      requestId: 'r1',
      conversationId: 'c1',
    },
  ];

  it.each(valid)('parses $type frame', (frame) => {
    expect(egoStreamFrameSchema.safeParse(frame).success).toBe(true);
  });

  it('rejects a tool frame with status running', () => {
    const frame = { type: 'tool', name: 'finance_search', status: 'running' };
    expect(egoStreamFrameSchema.safeParse(frame).success).toBe(false);
  });

  it('rejects an unknown frame type', () => {
    expect(egoStreamFrameSchema.safeParse({ type: 'ping' }).success).toBe(false);
  });

  it('rejects a done frame without parts', () => {
    const { parts: _parts, ...rest } = doneFrame;
    expect(egoStreamFrameSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a navigate frame with a malformed uri', () => {
    expect(egoStreamFrameSchema.safeParse({ type: 'navigate', uri: 'finance/x/1' }).success).toBe(
      false
    );
  });
});

describe('egoStreamBodySchema', () => {
  it('accepts a new message', () => {
    expect(egoStreamBodySchema.safeParse({ message: 'hi' }).success).toBe(true);
  });

  it('accepts a resume', () => {
    expect(
      egoStreamBodySchema.safeParse({ conversationId: 'c1', resumeBatchId: 'b1' }).success
    ).toBe(true);
  });

  it('rejects a resume without a conversation id', () => {
    expect(egoStreamBodySchema.safeParse({ resumeBatchId: 'b1' }).success).toBe(false);
  });

  it('rejects an empty body', () => {
    expect(egoStreamBodySchema.safeParse({}).success).toBe(false);
  });
});
