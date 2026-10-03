/**
 * Tool-turn tests for the ego LLM adapter: what tool definitions the SDK
 * receives and what a final message carrying tool calls turns into. The
 * Anthropic SDK is the only mock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  collect,
  cutOffMessage,
  fakeMessageStream,
  refusalMessage,
  restoreTelemetry,
  silenceTelemetry,
  textMessage,
  toolUseMessage,
} from '../../__tests__/llm-fixtures.js';

const streamMock = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { stream: streamMock };
  },
}));

const { AnthropicEgoLlm } = await import('../llm.js');
const { EGO_REFUSAL_MSG } = await import('../stream-events.js');

const MESSAGES = [{ role: 'user' as const, content: 'hi' }];
const TOOLS = [
  {
    name: 'finance_search',
    description: 'Search transactions',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  },
  {
    name: 'inventory_items_list',
    description: 'List items',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function run(
  request: Partial<Parameters<InstanceType<typeof AnthropicEgoLlm>['stream']>[0]>
) {
  return collect(new AnthropicEgoLlm().stream({ system: 'sys', messages: MESSAGES, ...request }));
}

beforeEach(() => {
  streamMock.mockReset();
  streamMock.mockReturnValue(fakeMessageStream(['ok'], textMessage('ok')));
  process.env['ANTHROPIC_API_KEY'] = 'sk-test';
  silenceTelemetry();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  restoreTelemetry();
  delete process.env['ANTHROPIC_API_KEY'];
  vi.restoreAllMocks();
});

describe('AnthropicEgoLlm tool definitions', () => {
  it('maps tools to the SDK shape with automatic tool choice', async () => {
    await run({ tools: TOOLS });

    const params = streamMock.mock.calls[0]?.[0];
    expect(params.tools).toEqual([
      {
        name: 'finance_search',
        description: 'Search transactions',
        input_schema: { type: 'object', properties: { query: { type: 'string' } } },
      },
      {
        name: 'inventory_items_list',
        description: 'List items',
        input_schema: { type: 'object', properties: {} },
      },
    ]);
    expect(params.tool_choice).toEqual({ type: 'auto' });
  });

  it('passes toolChoice none through', async () => {
    await run({ tools: TOOLS, toolChoice: 'none' });
    expect(streamMock.mock.calls[0]?.[0].tool_choice).toEqual({ type: 'none' });
  });

  it('sends neither tools nor tool_choice without tools', async () => {
    await run({});
    const params = streamMock.mock.calls[0]?.[0];
    expect(params).not.toHaveProperty('tools');
    expect(params).not.toHaveProperty('tool_choice');
  });

  it('sends neither tools nor tool_choice for an empty tools array', async () => {
    await run({ tools: [], toolChoice: 'none' });
    const params = streamMock.mock.calls[0]?.[0];
    expect(params).not.toHaveProperty('tools');
    expect(params).not.toHaveProperty('tool_choice');
  });
});

describe('AnthropicEgoLlm tool calls', () => {
  it('returns the tool calls and the untouched assistant content', async () => {
    const final = toolUseMessage('Looking.', [
      { id: 'toolu_1', name: 'finance_search', input: { query: 'coffee' } },
    ]);
    streamMock.mockReturnValue(fakeMessageStream(['Looking.'], final));

    const events = await run({ tools: TOOLS });

    expect(events.at(-1)).toEqual({
      type: 'done',
      fullText: 'Looking.',
      tokensIn: 20,
      tokensOut: 9,
      assistantContent: final.content,
      toolUses: [{ id: 'toolu_1', name: 'finance_search', input: { query: 'coffee' } }],
      stopReason: 'tool_use',
    });
    expect(final.content[0]?.type).toBe('thinking');
  });

  it('skips a tool call whose input is not an object and warns', async () => {
    const final = toolUseMessage('Looking.', [
      { id: 'toolu_1', name: 'finance_search', input: 'coffee' },
      { id: 'toolu_2', name: 'inventory_items_list', input: {} },
    ]);
    streamMock.mockReturnValue(fakeMessageStream([], final));

    const done = (await run({ tools: TOOLS })).at(-1);

    expect(done).toMatchObject({
      toolUses: [{ id: 'toolu_2', name: 'inventory_items_list', input: {} }],
    });
    expect(console.warn).toHaveBeenCalled();
  });

  it('runs no tools when the turn hit max_tokens', async () => {
    const final = {
      ...toolUseMessage('Looking', [{ id: 'toolu_1', name: 'finance_search', input: {} }]),
      stop_reason: 'max_tokens' as const,
    };
    streamMock.mockReturnValue(fakeMessageStream(['Looking'], final));

    const done = (await run({ tools: TOOLS })).at(-1);

    expect(done).toMatchObject({ toolUses: [], stopReason: 'max_tokens' });
  });

  it('runs no tools when the turn was refused', async () => {
    const final = {
      ...refusalMessage(),
      content: toolUseMessage('x', [{ id: 'toolu_1', name: 'finance_search', input: {} }]).content,
    };
    streamMock.mockReturnValue(fakeMessageStream([], final));

    const events = await run({ tools: TOOLS });

    expect(events.at(-1)).toMatchObject({
      fullText: EGO_REFUSAL_MSG,
      toolUses: [],
      stopReason: 'refusal',
      assistantContent: [{ type: 'text', text: EGO_REFUSAL_MSG }],
    });
  });

  it('reports end for an ordinary and a cut-off text reply', async () => {
    const ordinary = (await run({})).at(-1);
    expect(ordinary).toMatchObject({ stopReason: 'end', toolUses: [] });

    streamMock.mockReturnValue(fakeMessageStream(['cut'], cutOffMessage('cut')));
    const cutOff = (await run({})).at(-1);
    expect(cutOff).toMatchObject({ stopReason: 'max_tokens', toolUses: [] });
  });
});
