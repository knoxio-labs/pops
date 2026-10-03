/**
 * Request-shape tests for the ingest LLM adapter. The Anthropic SDK is the only
 * mock; `AnthropicIngestLlm` runs for real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CURRENT_MODEL,
  HAIKU_MODEL,
  restoreTelemetry,
  silenceTelemetry,
  textMessage,
  thinkingThenTextMessage,
} from '../../__tests__/llm-fixtures.js';

const createMock = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
  },
}));

const { AnthropicIngestLlm, DEFAULT_CLASSIFIER_MODEL } = await import('../llm.js');

function request(model: string) {
  return { operation: 'ingest.classify', model, prompt: 'classify this', maxTokens: 64 };
}

beforeEach(() => {
  createMock.mockReset();
  process.env['ANTHROPIC_API_KEY'] = 'sk-test';
  silenceTelemetry();
});

afterEach(() => {
  restoreTelemetry();
  delete process.env['ANTHROPIC_API_KEY'];
});

describe('AnthropicIngestLlm.complete request shape', () => {
  it('keeps the Haiku default at temperature 0 with no effort', async () => {
    expect(DEFAULT_CLASSIFIER_MODEL).toBe(HAIKU_MODEL);
    createMock.mockResolvedValue(textMessage('note'));
    await new AnthropicIngestLlm().complete(request(HAIKU_MODEL));

    expect(createMock.mock.calls[0]?.[0]).toEqual({
      model: HAIKU_MODEL,
      max_tokens: 64,
      temperature: 0,
      messages: [{ role: 'user', content: 'classify this' }],
    });
  });

  it('sends no temperature when the stage model is overridden to a current model', async () => {
    createMock.mockResolvedValue(textMessage('note'));
    await new AnthropicIngestLlm().complete(request(CURRENT_MODEL));

    const params = createMock.mock.calls[0]?.[0];
    expect(params).toMatchObject({ model: CURRENT_MODEL, max_tokens: 64 });
    expect(params).not.toHaveProperty('temperature');
  });

  it('reads the text of a response whose first block is thinking', async () => {
    createMock.mockResolvedValue(thinkingThenTextMessage('decision'));
    expect(await new AnthropicIngestLlm().complete(request(CURRENT_MODEL))).toBe('decision');
  });
});
