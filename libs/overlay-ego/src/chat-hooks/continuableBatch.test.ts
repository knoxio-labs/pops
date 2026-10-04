import { describe, expect, it } from 'vitest';

import { findContinuableBatchId } from './continuableBatch';

import type { MessagePart } from './message-parts';
import type { ChatMessage } from './types';

function message(parts: MessagePart[] | null, role = 'assistant'): ChatMessage {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    role,
    content: '',
    citations: null,
    parts,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function actions(
  batchId: string,
  statuses: Array<'pending' | 'confirmed' | 'rejected' | 'executed' | 'failed'>
): MessagePart {
  return {
    type: 'actions',
    batchId,
    actions: statuses.map((status, index) => ({
      actionId: batchId + '-' + index,
      tool: 'inventory.search',
      summary: 'Search inventory',
      status,
    })),
  };
}

describe('findContinuableBatchId', () => {
  it('returns a batch containing confirmed and rejected actions', () => {
    expect(findContinuableBatchId([message([actions('b1', ['confirmed', 'rejected'])])])).toBe(
      'b1'
    );
  });

  it('returns a batch when every action was rejected', () => {
    expect(findContinuableBatchId([message([actions('b1', ['rejected', 'rejected'])])])).toBe('b1');
  });

  it.each([
    ['executed and rejected', ['executed', 'rejected']],
    ['pending', ['confirmed', 'pending']],
    ['failed actions', ['failed', 'failed']],
  ] as const)('does not continue %s actions', (_label, statuses) => {
    expect(findContinuableBatchId([message([actions('b1', [...statuses])])])).toBeNull();
  });

  it('ignores action parts when a later message exists', () => {
    expect(
      findContinuableBatchId([
        message([actions('b1', ['confirmed'])]),
        message([{ type: 'text', text: 'A later reply' }]),
      ])
    ).toBeNull();
  });

  it('ignores a last message without parsed parts or with a non-assistant role', () => {
    expect(findContinuableBatchId([message(null)])).toBeNull();
    expect(findContinuableBatchId([message([actions('b1', ['confirmed'])], 'user')])).toBeNull();
  });

  it('returns the later qualifying action part', () => {
    expect(
      findContinuableBatchId([message([actions('b1', ['confirmed']), actions('b2', ['rejected'])])])
    ).toBe('b2');
  });
});
