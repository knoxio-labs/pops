import { describe, expect, it } from 'vitest';

import { buildLlmMessages, renderMessageForModel } from '../engine-helpers.js';

import type { EgoMessagePart } from '../../../../contract/rest-ego-parts.js';
import type { Message } from '../types.js';

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg_1',
    conversationId: 'conv_1',
    role: 'assistant',
    content: 'The answer.',
    citations: null,
    toolCalls: null,
    parts: null,
    tokensIn: null,
    tokensOut: null,
    createdAt: '2026-10-03T00:00:00.000Z',
    ...overrides,
  };
}

const pendingActions: EgoMessagePart = {
  type: 'actions',
  batchId: 'batch_1',
  actions: [
    { actionId: 'action_1', tool: 'inventory.move', summary: 'Move the drill', status: 'pending' },
    { actionId: 'action_2', tool: 'inventory.store', summary: 'Store the saw', status: 'pending' },
  ],
};

describe('renderMessageForModel', () => {
  it('renders text, entity and actions in their original order', () => {
    expect(
      renderMessageForModel(
        message({
          parts: [
            { type: 'text', text: 'The answer.' },
            { type: 'entity', uri: 'pops:inventory/item/drill_1', title: 'Drill' },
            pendingActions,
          ],
        })
      )
    ).toBe(
      'The answer.\n\n[shown: Drill (pops:inventory/item/drill_1)]\n' +
        '[action inventory.move "Move the drill": pending]\n' +
        '[action inventory.store "Store the saw": pending]'
    );
  });

  it.each(['rejected', 'executed', 'failed'] as const)(
    'preserves the %s status in action history',
    (status) => {
      const actions: EgoMessagePart = {
        type: 'actions',
        batchId: 'batch_1',
        actions: [{ actionId: 'action_1', tool: 'inventory.move', summary: 'Move it', status }],
      };
      expect(renderMessageForModel(message({ parts: [actions] }))).toBe(
        `The answer.\n\n[action inventory.move "Move it": ${status}]`
      );
    }
  );

  it.each([null, []])('returns content unchanged when parts are %s', (parts) => {
    expect(renderMessageForModel(message({ content: '  unchanged\n', parts }))).toBe(
      '  unchanged\n'
    );
  });

  it('renders action-only messages without a leading blank line', () => {
    expect(renderMessageForModel(message({ content: '', parts: [pendingActions] }))).toBe(
      '[action inventory.move "Move the drill": pending]\n' +
        '[action inventory.store "Store the saw": pending]'
    );
  });
});

describe('buildLlmMessages', () => {
  it('keeps action-only history and skips empty assistant messages', () => {
    const history = [
      message({ role: 'user', content: 'First turn.' }),
      message({ id: 'msg_empty', content: '   ' }),
      message({ id: 'msg_actions', content: '', parts: [pendingActions] }),
    ];

    expect(buildLlmMessages(history, 'Current turn.', '', 20)).toEqual([
      { role: 'user', content: 'First turn.' },
      {
        role: 'assistant',
        content:
          '[action inventory.move "Move the drill": pending]\n' +
          '[action inventory.store "Store the saw": pending]',
      },
      { role: 'user', content: 'Current turn.' },
    ]);
  });

  it('starts a normal history window with a user message', () => {
    const history = [
      message({ id: 'msg_leading', role: 'assistant', content: 'Orphaned assistant.' }),
      message({ id: 'msg_user', role: 'user', content: 'User turn.' }),
      message({ id: 'msg_reply', role: 'assistant', content: 'Assistant reply.' }),
    ];

    expect(buildLlmMessages(history, 'Current turn.', '', 20)).toEqual([
      { role: 'user', content: 'User turn.' },
      { role: 'assistant', content: 'Assistant reply.' },
      { role: 'user', content: 'Current turn.' },
    ]);
  });

  it('drops a leading assistant when the history limit starts mid-turn', () => {
    const history = [
      message({ id: 'msg_old_user', role: 'user', content: 'Old user turn.' }),
      message({ id: 'msg_old_reply', role: 'assistant', content: 'Old reply.' }),
      message({ id: 'msg_kept_user', role: 'user', content: 'Kept user turn.' }),
      message({ id: 'msg_kept_reply', role: 'assistant', content: 'Kept reply.' }),
    ];

    expect(buildLlmMessages(history, 'Current turn.', '', 3)).toEqual([
      { role: 'user', content: 'Kept user turn.' },
      { role: 'assistant', content: 'Kept reply.' },
      { role: 'user', content: 'Current turn.' },
    ]);
  });

  it('does not render parts into user messages and keeps the context block', () => {
    const userMessage = message({
      role: 'user',
      content: '  literal user text  ',
      parts: [{ type: 'entity', uri: 'pops:inventory/item/drill_1', title: 'Drill' }],
    });

    expect(buildLlmMessages([userMessage], 'Current turn.', 'Retrieved item.', 20)).toEqual([
      { role: 'user', content: '  literal user text  ' },
      { role: 'user', content: 'Current turn.\n\n---\nRetrieved knowledge:\nRetrieved item.' },
    ]);
  });
});
