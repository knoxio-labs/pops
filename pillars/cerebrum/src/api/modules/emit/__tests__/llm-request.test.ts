/**
 * Request-shape and outcome tests for the emit LLM adapter. The Anthropic SDK
 * is the only mock; `AnthropicGenerationLlm` runs for real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CURRENT_MODEL,
  cutOffMessage,
  HAIKU_MODEL,
  refusalMessage,
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

const { AnthropicGenerationLlm, DEFAULT_EMIT_MODEL } = await import('../llm.js');

const MODEL_ENV = 'CEREBRUM_EMIT_MODEL';

beforeEach(() => {
  createMock.mockReset();
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

describe('AnthropicGenerationLlm.generate', () => {
  it('defaults to the current Sonnet with medium effort, an 8000-token cap and no sampling param', async () => {
    expect(DEFAULT_EMIT_MODEL).toBe(CURRENT_MODEL);
    createMock.mockResolvedValue(textMessage('# Doc'));
    await new AnthropicGenerationLlm().generate('sys', 'topic');

    const params = createMock.mock.calls[0]?.[0];
    expect(params).toEqual({
      model: CURRENT_MODEL,
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      system: 'sys',
      messages: [{ role: 'user', content: 'topic' }],
    });
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('thinking');
  });

  it('keeps temperature 0 and drops effort on a Haiku override', async () => {
    process.env[MODEL_ENV] = HAIKU_MODEL;
    createMock.mockResolvedValue(textMessage('# Doc'));
    await new AnthropicGenerationLlm().generate('sys', 'topic');

    const params = createMock.mock.calls[0]?.[0];
    expect(params).toMatchObject({ model: HAIKU_MODEL, temperature: 0 });
    expect(params).not.toHaveProperty('output_config');
  });

  it('returns the text of a complete response, unflagged', async () => {
    createMock.mockResolvedValue(thinkingThenTextMessage('# Doc\n\nbody'));
    expect(await new AnthropicGenerationLlm().generate('sys', 'topic')).toEqual({
      kind: 'text',
      text: '# Doc\n\nbody',
      outputTruncated: false,
    });
  });

  it('flags an output cut off at the token cap', async () => {
    createMock.mockResolvedValue(cutOffMessage('# Doc\n\nhalf a sent'));
    expect(await new AnthropicGenerationLlm().generate('sys', 'topic')).toEqual({
      kind: 'text',
      text: '# Doc\n\nhalf a sent',
      outputTruncated: true,
    });
  });

  it('reports a refusal as its own outcome, not as empty text', async () => {
    createMock.mockResolvedValue(refusalMessage('# Doc'));
    expect(await new AnthropicGenerationLlm().generate('sys', 'topic')).toEqual({
      kind: 'refused',
    });
  });

  it('still throws on a transport error', async () => {
    createMock.mockRejectedValue(new Error('boom'));
    await expect(new AnthropicGenerationLlm().generate('sys', 'topic')).rejects.toThrow(
      'Document generation failed: boom'
    );
  });
});
