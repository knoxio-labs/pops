import { describe, expect, it } from 'vitest';

import { runToolLoop } from '../tool-loop.js';
import { fakeToolbox, scriptedLlm, userMessage } from './fakes.js';

import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';

import type { EgoEntityPart } from '../../../../contract/rest-ego-parts.js';
import type { EgoToolUse } from '../llm.js';
import type { LoopEvent } from '../tool-loop.js';

const lookup = (id: string, input: Record<string, unknown> = {}): EgoToolUse => ({
  id,
  name: 'lookup',
  input,
});

async function collectLoop(params: Parameters<typeof runToolLoop>[0]) {
  const events: LoopEvent[] = [];
  for await (const event of runToolLoop(params)) events.push(event);
  return events;
}

function done(events: LoopEvent[]): Extract<LoopEvent, { type: 'done' }> {
  const last = events.at(-1);
  if (last?.type !== 'done') throw new Error('Tool loop did not finish.');
  return last;
}

function ids() {
  let next = 0;
  return {
    newActionId: () => 'action-' + ++next,
    newBatchId: () => 'batch-1',
  };
}

const readTool = (text = 'read result') => ({
  lookup: () => ({ kind: 'result' as const, text, isError: false }),
});

describe('runToolLoop', () => {
  it('makes one tool-free model call when no toolbox is provided', async () => {
    const { llm, requests } = scriptedLlm([{ text: 'answer' }]);
    const events = await collectLoop({
      llm,
      system: 'sys',
      messages: [userMessage('hi')],
      ...ids(),
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).not.toHaveProperty('tools');
    expect(done(events)).toMatchObject({ parts: [], batch: null, fullText: 'answer' });
  });

  it('runs a read before continuing the model turn with one result message', async () => {
    const { llm, requests } = scriptedLlm([{ toolUses: [lookup('u1')] }, { text: 'answer' }]);
    const { toolbox } = fakeToolbox(readTool());
    const events = await collectLoop({
      llm,
      toolbox,
      system: 'sys',
      messages: [userMessage('hi')],
      ...ids(),
    });

    expect(events.map((event) => event.type)).toEqual(['tool', 'tool', 'token', 'done']);
    expect(events.slice(0, 2)).toEqual([
      { type: 'tool', name: 'lookup', status: 'started' },
      { type: 'tool', name: 'lookup', status: 'finished' },
    ]);
    expect(requests[1]?.messages.slice(-2)).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'u1', name: 'lookup', input: {} }],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'u1', content: 'read result', is_error: false },
        ],
      },
    ]);
  });

  it('keeps multiple tool results together in one user message', async () => {
    const { llm, requests } = scriptedLlm([
      { toolUses: [lookup('u1'), lookup('u2', { n: 2 })] },
      { text: 'done' },
    ]);
    const { toolbox } = fakeToolbox(readTool());
    await collectLoop({ llm, toolbox, system: 'sys', messages: [userMessage('hi')], ...ids() });

    expect(requests[1]?.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'u1', content: 'read result', is_error: false },
        { type: 'tool_result', tool_use_id: 'u2', content: 'read result', is_error: false },
      ],
    });
  });

  it('emits entity parts and navigation results from a read tool', async () => {
    const entity: EgoEntityPart = {
      type: 'entity',
      uri: 'pops:finance/transaction/tx_1',
      title: 'Coffee',
    };
    const { llm } = scriptedLlm([{ toolUses: [lookup('u1')] }, { text: 'Found it.' }]);
    const { toolbox } = fakeToolbox({
      lookup: () => ({
        kind: 'result',
        text: 'found',
        isError: false,
        parts: [entity],
        navigate: entity.uri,
      }),
    });
    const events = await collectLoop({
      llm,
      toolbox,
      system: 'sys',
      messages: [userMessage('hi')],
      ...ids(),
    });

    expect(events).toContainEqual({ type: 'part', part: entity });
    expect(events).toContainEqual({ type: 'navigate', uri: entity.uri });
    expect(done(events).parts).toEqual([entity]);
  });

  it('collects every proposed write into one pending action part and pauses', async () => {
    const toolUses = ['write_one', 'write_two', 'write_three'].map((name, index) => ({
      id: 'u' + (index + 1),
      name,
      input: { value: index + 1 },
    }));
    const handlers = Object.fromEntries(
      toolUses.map((toolUse) => [
        toolUse.name,
        (input: Record<string, unknown>) => ({
          kind: 'write' as const,
          tool: toolUse.name,
          args: input,
          summary: toolUse.name,
        }),
      ])
    );
    const { llm, requests } = scriptedLlm([{ toolUses }]);
    const { toolbox, calls } = fakeToolbox(handlers, {
      writes: toolUses.map((toolUse) => toolUse.name),
    });
    const events = await collectLoop({
      llm,
      toolbox,
      system: 'sys',
      messages: [userMessage('hi')],
      ...ids(),
    });
    const actionsPart = {
      type: 'actions' as const,
      batchId: 'batch-1',
      actions: toolUses.map((toolUse, index) => ({
        actionId: 'action-' + (index + 1),
        tool: toolUse.name,
        summary: toolUse.name,
        status: 'pending' as const,
      })),
    };

    expect(requests).toHaveLength(1);
    expect(calls).toHaveLength(3);
    expect(events.filter((event) => event.type === 'tool')).toEqual([]);
    expect(events.filter((event) => event.type === 'part')).toEqual([
      { type: 'part', part: actionsPart },
    ]);
    expect(done(events).batch?.actions.map((action) => action.actionId)).toEqual([
      'action-1',
      'action-2',
      'action-3',
    ]);
  });

  it('executes reads in a mixed turn and pauses with all results and the assistant message', async () => {
    const write: EgoToolUse = { id: 'w1', name: 'write', input: { amount: 5 } };
    const { llm } = scriptedLlm([{ toolUses: [lookup('r1'), write] }]);
    const { toolbox, calls } = fakeToolbox(
      {
        ...readTool(),
        write: (input) => ({ kind: 'write', tool: 'write', args: input, summary: 'write it' }),
      },
      { writes: ['write'] }
    );
    const events = await collectLoop({
      llm,
      toolbox,
      system: 'sys',
      messages: [userMessage('hi')],
      ...ids(),
    });
    const batch = done(events).batch;

    expect(calls.map((call) => call.name)).toEqual(['lookup', 'write']);
    expect(batch?.state.results).toEqual([
      { toolUseId: 'r1', content: 'read result', isError: false },
      { toolUseId: 'w1', actionId: 'action-1' },
    ]);
    expect(batch?.state.messages.at(-1)).toEqual({
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'r1', name: 'lookup', input: {} },
        { type: 'tool_use', id: 'w1', name: 'write', input: { amount: 5 } },
      ],
    });
  });

  it('keeps batch results in model call order when a read follows a write', async () => {
    const write: EgoToolUse = { id: 'w1', name: 'write', input: {} };
    const { llm } = scriptedLlm([{ toolUses: [write, lookup('r1')] }]);
    const { toolbox } = fakeToolbox(
      {
        ...readTool(),
        write: (input) => ({ kind: 'write', tool: 'write', args: input, summary: 'write it' }),
      },
      { writes: ['write'] }
    );
    const events = await collectLoop({
      llm,
      toolbox,
      system: 'sys',
      messages: [userMessage('hi')],
      ...ids(),
    });

    expect(done(events).batch?.state.results).toEqual([
      { toolUseId: 'w1', actionId: 'action-1' },
      { toolUseId: 'r1', content: 'read result', isError: false },
    ]);
  });

  it('stops after forty read rounds with one final no-tools-choice request', async () => {
    const { llm, requests } = scriptedLlm([{ toolUses: [lookup('u1')] }]);
    const { toolbox, calls } = fakeToolbox(readTool());
    const events = await collectLoop({
      llm,
      toolbox,
      system: 'sys',
      messages: [userMessage('hi')],
      ...ids(),
    });

    expect(requests).toHaveLength(41);
    expect(requests[40]).toMatchObject({ toolChoice: 'none', tools: requests[0]?.tools });
    expect(calls).toHaveLength(40);
    expect(done(events).batch).toBeNull();
  });

  it('turns dispatch exceptions into failed tool results and continues', async () => {
    const { llm, requests } = scriptedLlm([{ toolUses: [lookup('u1')] }, { text: 'recovered' }]);
    const { toolbox } = fakeToolbox({ lookup: () => Promise.reject(new Error('dispatch failed')) });
    const events = await collectLoop({
      llm,
      toolbox,
      system: 'sys',
      messages: [userMessage('hi')],
      ...ids(),
    });

    expect(events.slice(0, 2)).toEqual([
      { type: 'tool', name: 'lookup', status: 'started' },
      { type: 'tool', name: 'lookup', status: 'failed' },
    ]);
    expect(requests[1]?.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'u1', content: 'dispatch failed', is_error: true },
      ],
    });
  });

  it('adds an error result for an assistant tool block missing from toolUses', async () => {
    const first = { type: 'tool_use' as const, id: 'u1', name: 'write', input: {} };
    const omitted = {
      type: 'tool_use',
      id: 'u2',
      name: 'write',
      input: 'invalid',
    } as unknown as ContentBlockParam;
    const { llm } = scriptedLlm([
      {
        toolUses: [{ id: 'u1', name: 'write', input: {} }],
        assistantContent: [first, omitted],
      },
    ]);
    const { toolbox } = fakeToolbox(
      { write: (input) => ({ kind: 'write', tool: 'write', args: input, summary: 'write it' }) },
      { writes: ['write'] }
    );
    const events = await collectLoop({
      llm,
      toolbox,
      system: 'sys',
      messages: [userMessage('hi')],
      ...ids(),
    });

    expect(done(events).batch?.state.results).toEqual([
      { toolUseId: 'u1', actionId: 'action-1' },
      { toolUseId: 'u2', content: 'The tool input was not valid.', isError: true },
    ]);
  });

  it('counts startRound toward the backstop', async () => {
    const { llm, requests } = scriptedLlm([{ toolUses: [lookup('u1')] }]);
    const { toolbox } = fakeToolbox(readTool());
    await collectLoop({
      llm,
      toolbox,
      system: 'sys',
      messages: [userMessage('hi')],
      startRound: 39,
      ...ids(),
    });

    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ toolChoice: 'none' });
  });

  it('finishes without dispatching when the model reports a max_tokens stop', async () => {
    const { llm } = scriptedLlm([
      { stopReason: 'max_tokens', toolUses: [lookup('u1')], text: 'partial' },
    ]);
    const { toolbox, calls } = fakeToolbox(readTool());
    const events = await collectLoop({
      llm,
      toolbox,
      system: 'sys',
      messages: [userMessage('hi')],
      ...ids(),
    });

    expect(calls).toEqual([]);
    expect(done(events)).toMatchObject({ fullText: 'partial', batch: null });
  });

  it('sums token counts from every model call', async () => {
    const { llm } = scriptedLlm([
      { toolUses: [lookup('u1')] },
      { toolUses: [lookup('u2')] },
      { text: 'answer' },
    ]);
    const { toolbox } = fakeToolbox(readTool());
    const events = await collectLoop({
      llm,
      toolbox,
      system: 'sys',
      messages: [userMessage('hi')],
      ...ids(),
    });

    expect(done(events)).toMatchObject({ tokensIn: 3, tokensOut: 3, fullText: 'answer' });
  });
});
