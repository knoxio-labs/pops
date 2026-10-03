import { describe, expect, it } from 'vitest';

import {
  DECLINED_RESULT,
  INTERRUPTED_RESULT,
  resolutionFor,
  resumeToolLoop,
} from '../loop-resume.js';
import { isEgoMessageList, parsePausedLoopState } from '../loop-state.js';
import { fakeToolbox, scriptedLlm, userMessage } from './fakes.js';

import type { EgoActionStatus } from '../../../../db/services/ego-actions-types.js';
import type { LoopEvent, PausedLoopState } from '../tool-loop-types.js';

async function collectResume(params: Parameters<typeof resumeToolLoop>[0]): Promise<LoopEvent[]> {
  const events: LoopEvent[] = [];
  for await (const event of resumeToolLoop(params)) events.push(event);
  return events;
}

function done(events: LoopEvent[]): Extract<LoopEvent, { type: 'done' }> {
  const last = events.at(-1);
  if (last?.type !== 'done') throw new Error('Resumed tool loop did not finish.');
  return last;
}

function pausedState(results: PausedLoopState['results']): PausedLoopState {
  return {
    system: 'stored system',
    round: 3,
    messages: [
      userMessage('do these actions'),
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'read-1', name: 'lookup', input: {} },
          { type: 'tool_use', id: 'write-1', name: 'create_one', input: {} },
          { type: 'tool_use', id: 'write-2', name: 'create_two', input: {} },
        ],
      },
    ],
    results,
  };
}

function ids() {
  let nextAction = 0;
  let nextBatch = 0;
  return {
    newActionId: () => 'new-action-' + ++nextAction,
    newBatchId: () => 'new-batch-' + ++nextBatch,
  };
}

describe('resumeToolLoop', () => {
  it('resumes in tool-call order with stored reads and executed or declined writes', async () => {
    const state = pausedState([
      { toolUseId: 'read-1', content: 'read result', isError: false },
      { toolUseId: 'write-1', actionId: 'action-1' },
      { toolUseId: 'write-2', actionId: 'action-2' },
    ]);
    const { llm, requests } = scriptedLlm([{ text: 'continued' }]);
    const { toolbox } = fakeToolbox({
      lookup: () => ({ kind: 'result', text: 'fresh', isError: false }),
    });

    const events = await collectResume({
      llm,
      toolbox,
      state,
      resolutions: new Map([
        ['action-1', { content: 'write completed', isError: false }],
        ['action-2', { content: DECLINED_RESULT, isError: false }],
      ]),
      ...ids(),
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      system: 'stored system',
      tools: [{ name: 'lookup' }],
    });
    expect(requests[0]?.messages.slice(-2)).toEqual([
      state.messages[1],
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'read-1', content: 'read result', is_error: false },
          {
            type: 'tool_result',
            tool_use_id: 'write-1',
            content: 'write completed',
            is_error: false,
          },
          {
            type: 'tool_result',
            tool_use_id: 'write-2',
            content: DECLINED_RESULT,
            is_error: false,
          },
        ],
      },
    ]);
    expect(done(events).fullText).toBe('continued');
  });

  it('returns an interrupted error result when a resolution is missing', async () => {
    const { llm, requests } = scriptedLlm([{ text: 'continued' }]);
    const state = pausedState([{ toolUseId: 'write-1', actionId: 'missing' }]);

    await collectResume({ llm, state, resolutions: new Map(), ...ids() });

    expect(requests[0]?.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'write-1',
          content: INTERRUPTED_RESULT,
          is_error: true,
        },
      ],
    });
  });

  it('maps all persisted action statuses to safe model results', () => {
    const actions: { status: EgoActionStatus; result: string | null }[] = [
      { status: 'executed', result: 'created' },
      { status: 'failed', result: 'gateway error' },
      { status: 'rejected', result: 'ignored persisted text' },
      { status: 'pending', result: null },
      { status: 'confirmed', result: null },
    ];

    expect(actions.map(resolutionFor)).toEqual([
      { content: 'created', isError: false },
      { content: 'gateway error', isError: true },
      { content: DECLINED_RESULT, isError: false },
      { content: INTERRUPTED_RESULT, isError: true },
      { content: INTERRUPTED_RESULT, isError: true },
    ]);
    expect(resolutionFor({ status: 'executed', result: null })).toEqual({
      content: '',
      isError: false,
    });
    expect(resolutionFor({ status: 'failed', result: null })).toEqual({
      content: 'The action failed.',
      isError: true,
    });
  });

  it('starts a fresh pending batch when the resumed model proposes another write', async () => {
    const tool = 'finance.transactions.create';
    const { llm } = scriptedLlm([
      { toolUses: [{ id: 'write-new', name: tool, input: { amount: 3 } }] },
    ]);
    const { toolbox } = fakeToolbox(
      {
        [tool]: (args) => ({ kind: 'write', tool, args, summary: 'Create transaction' }),
      },
      { writes: [tool] }
    );
    const state = pausedState([{ toolUseId: 'write-1', actionId: 'action-1' }]);

    const events = await collectResume({
      llm,
      toolbox,
      state,
      resolutions: new Map([['action-1', { content: 'done', isError: false }]]),
      ...ids(),
    });

    expect(done(events).batch).toMatchObject({
      batchId: 'new-batch-1',
      actions: [{ actionId: 'new-action-1', tool }],
    });
  });

  it('counts the stored round toward the forty-round backstop', async () => {
    const { llm, requests } = scriptedLlm([
      { toolUses: [{ id: 'read-next', name: 'lookup', input: {} }] },
    ]);
    const { toolbox, calls } = fakeToolbox({
      lookup: () => ({ kind: 'result', text: 'read result', isError: false }),
    });
    const state: PausedLoopState = {
      ...pausedState([{ toolUseId: 'read-1', content: 'read result', isError: false }]),
      round: 39,
    };

    await collectResume({ llm, toolbox, state, resolutions: new Map(), ...ids() });

    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ toolChoice: 'none' });
    expect(calls).toHaveLength(1);
  });
});

describe('loop state parsing', () => {
  it('round-trips a paused state through JSON', () => {
    const state = pausedState([
      { toolUseId: 'read-1', content: 'read result', isError: false },
      { toolUseId: 'write-1', actionId: 'action-1' },
    ]);
    const serialized: string = JSON.stringify(state);
    const parsedValue: unknown = JSON.parse(serialized);

    expect(parsePausedLoopState(parsedValue)).toEqual(state);
    expect(isEgoMessageList(state.messages)).toBe(true);
  });

  it('returns null for malformed persisted state and messages', () => {
    const malformed: unknown[] = [
      { round: 1, results: [], messages: [] },
      { system: 'sys', round: 1, results: 'invalid', messages: [] },
      { system: 'sys', round: 1, results: [], messages: [{ role: 'system', content: 'no' }] },
      { system: 'sys', round: 1, results: [], messages: [{ role: 'user', content: [{}] }] },
      null,
      'invalid',
    ];

    expect(malformed.map(parsePausedLoopState)).toEqual(malformed.map(() => null));
    expect(isEgoMessageList([{ role: 'assistant', content: [{ text: 'missing type' }] }])).toBe(
      false
    );
  });
});
