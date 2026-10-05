/**
 * Request-shape and outcome tests for the ego LLM adapter. The Anthropic SDK is
 * the only mock; `AnthropicEgoLlm` runs for real so the assertions are on the
 * exact params sent for each model family and on what a thinking-first, a
 * refused and a streamed response turn into.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  captureTelemetryRecord,
  collect,
  CURRENT_MODEL,
  fakeMessageStream,
  HAIKU_MODEL,
  LEGACY_SONNET_MODEL,
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

const { AnthropicEgoLlm, DEFAULT_EGO_MODEL } = await import('../llm.js');
const { EGO_REFUSAL_MSG } = await import('../stream-events.js');

const MODEL_ENV = 'CEREBRUM_EGO_MODEL';
const MESSAGES = [{ role: 'user' as const, content: 'hi' }];

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

describe('AnthropicEgoLlm request shape', () => {
  it('defaults to the current Sonnet', () => {
    expect(DEFAULT_EGO_MODEL).toBe(CURRENT_MODEL);
    expect(new AnthropicEgoLlm().model()).toBe(CURRENT_MODEL);
  });

  it('sends a current model low effort, thinking headroom and no sampling or thinking param', async () => {
    createMock.mockResolvedValue(textMessage('ok'));
    await new AnthropicEgoLlm().chat('sys', MESSAGES);

    const params = createMock.mock.calls[0]?.[0];
    expect(params).toEqual({
      model: CURRENT_MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low' },
      system: 'sys',
      messages: MESSAGES,
    });
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('thinking');
  });

  it('keeps the temperature and drops effort on a Haiku override', async () => {
    process.env[MODEL_ENV] = HAIKU_MODEL;
    createMock.mockResolvedValue(textMessage('ok'));
    await new AnthropicEgoLlm().chat('sys', MESSAGES);

    const params = createMock.mock.calls[0]?.[0];
    expect(params).toMatchObject({ model: HAIKU_MODEL, temperature: 0.3 });
    expect(params).not.toHaveProperty('output_config');
  });

  it('keeps the temperature on a legacy Sonnet override', async () => {
    process.env[MODEL_ENV] = LEGACY_SONNET_MODEL;
    createMock.mockResolvedValue(textMessage('ok'));
    await new AnthropicEgoLlm().chat('sys', MESSAGES);

    expect(createMock.mock.calls[0]?.[0]).toMatchObject({
      model: LEGACY_SONNET_MODEL,
      temperature: 0.3,
    });
  });

  it('streams with the same per-model request as chat', async () => {
    streamMock.mockReturnValue(fakeMessageStream(['ok'], textMessage('ok')));
    await collect(new AnthropicEgoLlm().stream('sys', MESSAGES));

    const params = streamMock.mock.calls[0]?.[0];
    expect(params).toMatchObject({ model: CURRENT_MODEL, output_config: { effort: 'low' } });
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('thinking');
  });
});

describe('AnthropicEgoLlm outcomes', () => {
  it('reads the text of a response whose first block is thinking', async () => {
    createMock.mockResolvedValue(thinkingThenTextMessage('Grounded answer.'));
    const result = await new AnthropicEgoLlm().chat('sys', MESSAGES);
    expect(result.content).toBe('Grounded answer.');
  });

  it('reports the provider stop reason without adding it to the chat response', async () => {
    const report = captureTelemetryRecord();
    createMock.mockResolvedValue(textMessage('Grounded answer.'));

    const result = await new AnthropicEgoLlm().chat('sys', MESSAGES);

    expect(result).toEqual({ content: 'Grounded answer.', tokensIn: 20, tokensOut: 9 });
    expect((await report).stopReason).toBe('end_turn');
  });

  it('answers a refused chat with the refusal message, never an empty reply', async () => {
    createMock.mockResolvedValue(refusalMessage());
    const result = await new AnthropicEgoLlm().chat('sys', MESSAGES);
    expect(result).toEqual({ content: EGO_REFUSAL_MSG, tokensIn: 20, tokensOut: 9 });
  });

  it('closes a refused stream with the refusal message', async () => {
    streamMock.mockReturnValue(fakeMessageStream([], refusalMessage()));
    const events = await collect(new AnthropicEgoLlm().stream('sys', MESSAGES));

    expect(events).toEqual([
      { type: 'token', text: EGO_REFUSAL_MSG },
      { type: 'done', fullText: EGO_REFUSAL_MSG, tokensIn: 20, tokensOut: 9 },
    ]);
  });

  it('appends the refusal message after text that already streamed', async () => {
    streamMock.mockReturnValue(fakeMessageStream(['Partial'], refusalMessage('Partial')));
    const events = await collect(new AnthropicEgoLlm().stream('sys', MESSAGES));

    expect(events.at(-1)).toMatchObject({
      type: 'done',
      fullText: `Partial\n\n${EGO_REFUSAL_MSG}`,
    });
  });

  it('adds nothing to a stream that completed normally', async () => {
    streamMock.mockReturnValue(fakeMessageStream(['Hello'], textMessage('Hello')));
    const events = await collect(new AnthropicEgoLlm().stream('sys', MESSAGES));
    expect(events).toEqual([
      { type: 'token', text: 'Hello' },
      { type: 'done', fullText: 'Hello', tokensIn: 20, tokensOut: 9 },
    ]);
  });
});
