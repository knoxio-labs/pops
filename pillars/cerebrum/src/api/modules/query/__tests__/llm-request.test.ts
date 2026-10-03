/**
 * Request-shape and outcome tests for the query LLM adapters. The Anthropic SDK
 * is the only mock; the one-shot and streaming adapters run for real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  collect,
  CURRENT_MODEL,
  fakeMessageStream,
  HAIKU_MODEL,
  refusalMessage,
  restoreTelemetry,
  silenceTelemetry,
  textMessage,
  thinkingThenTextMessage,
} from '../../__tests__/llm-fixtures.js';

const createMock = vi.hoisted(() => vi.fn());
const streamMock = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock, stream: streamMock };
  },
}));

const { AnthropicQueryLlm, AnthropicQueryStreamLlm, DEFAULT_QUERY_MODEL, QUERY_REFUSAL_MSG } =
  await import('../llm.js');

const MODEL_ENV = 'CEREBRUM_QUERY_MODEL';

beforeEach(() => {
  createMock.mockReset();
  streamMock.mockReset();
  process.env['ANTHROPIC_API_KEY'] = 'sk-test';
  delete process.env[MODEL_ENV];
  silenceTelemetry();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  restoreTelemetry();
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env[MODEL_ENV];
  vi.restoreAllMocks();
});

describe('AnthropicQueryLlm.complete', () => {
  it('defaults to the current Sonnet with low effort, thinking headroom and no sampling param', async () => {
    expect(DEFAULT_QUERY_MODEL).toBe(CURRENT_MODEL);
    createMock.mockResolvedValue(textMessage('ok'));
    await new AnthropicQueryLlm().complete('sys', 'why?');

    const params = createMock.mock.calls[0]?.[0];
    expect(params).toEqual({
      model: CURRENT_MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low' },
      system: 'sys',
      messages: [{ role: 'user', content: 'why?' }],
    });
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('thinking');
  });

  it('keeps temperature 0 and drops effort on a Haiku override', async () => {
    process.env[MODEL_ENV] = HAIKU_MODEL;
    createMock.mockResolvedValue(textMessage('ok'));
    await new AnthropicQueryLlm().complete('sys', 'why?');

    const params = createMock.mock.calls[0]?.[0];
    expect(params).toMatchObject({ model: HAIKU_MODEL, temperature: 0 });
    expect(params).not.toHaveProperty('output_config');
  });

  it('reads the text of a response whose first block is thinking', async () => {
    createMock.mockResolvedValue(thinkingThenTextMessage('Because SQLite.'));
    expect(await new AnthropicQueryLlm().complete('sys', 'why?')).toBe('Because SQLite.');
  });

  it('answers a refusal with the refusal message, never an empty answer', async () => {
    createMock.mockResolvedValue(refusalMessage());
    expect(await new AnthropicQueryLlm().complete('sys', 'why?')).toBe(QUERY_REFUSAL_MSG);
  });
});

describe('AnthropicQueryStreamLlm.stream', () => {
  it('streams a current model with low effort and no sampling or thinking param', async () => {
    streamMock.mockReturnValue(fakeMessageStream(['ok'], textMessage('ok')));
    await collect(new AnthropicQueryStreamLlm().stream('sys', 'why?'));

    const params = streamMock.mock.calls[0]?.[0];
    expect(params).toMatchObject({
      model: CURRENT_MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low' },
    });
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('thinking');
  });

  it('yields the refusal message when the final message is a refusal', async () => {
    streamMock.mockReturnValue(fakeMessageStream([], refusalMessage()));
    const chunks = await collect(new AnthropicQueryStreamLlm().stream('sys', 'why?'));

    expect(chunks).toEqual([
      { kind: 'delta', text: QUERY_REFUSAL_MSG },
      { kind: 'final', tokensIn: 20, tokensOut: 9 },
    ]);
  });

  it('separates the refusal message from text that already streamed', async () => {
    streamMock.mockReturnValue(fakeMessageStream(['Partial'], refusalMessage('Partial')));
    const chunks = await collect(new AnthropicQueryStreamLlm().stream('sys', 'why?'));

    expect(chunks.slice(0, 2)).toEqual([
      { kind: 'delta', text: 'Partial' },
      { kind: 'delta', text: `\n\n${QUERY_REFUSAL_MSG}` },
    ]);
  });

  it('adds nothing to a stream that completed normally', async () => {
    streamMock.mockReturnValue(fakeMessageStream(['Hello'], textMessage('Hello')));
    const chunks = await collect(new AnthropicQueryStreamLlm().stream('sys', 'why?'));
    expect(chunks).toEqual([
      { kind: 'delta', text: 'Hello' },
      { kind: 'final', tokensIn: 20, tokensOut: 9 },
    ]);
  });
});
