/**
 * Request-shape tests for the contradiction analyzer. The Anthropic SDK is the
 * only mock; `AnthropicContradictionAnalyzer` runs for real.
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

const { AnthropicContradictionAnalyzer } = await import('../contradiction-analyzer.js');

const MODEL_ENV = 'CEREBRUM_PATTERN_CONTRADICTION_MODEL';
const VERDICT = JSON.stringify({
  contradiction: true,
  conflict: 'A says Postgres, B says SQLite',
  excerptA: 'We use Postgres.',
  excerptB: 'We use SQLite.',
});

function analyze() {
  return new AnthropicContradictionAnalyzer().analyze('eng_a', 'body a', 'eng_b', 'body b');
}

beforeEach(() => {
  createMock.mockReset();
  process.env['ANTHROPIC_API_KEY'] = 'sk-test';
  delete process.env[MODEL_ENV];
  silenceTelemetry();
});

afterEach(() => {
  restoreTelemetry();
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env[MODEL_ENV];
});

describe('AnthropicContradictionAnalyzer request shape', () => {
  it('keeps the Haiku default at temperature 0 with no effort', async () => {
    createMock.mockResolvedValue(textMessage(VERDICT));
    await analyze();

    const params = createMock.mock.calls[0]?.[0];
    expect(params).toMatchObject({ model: HAIKU_MODEL, max_tokens: 500, temperature: 0 });
    expect(params).not.toHaveProperty('output_config');
  });

  it('sends no temperature when the model is overridden to a current model', async () => {
    process.env[MODEL_ENV] = CURRENT_MODEL;
    createMock.mockResolvedValue(textMessage(VERDICT));
    await analyze();

    const params = createMock.mock.calls[0]?.[0];
    expect(params).toMatchObject({ model: CURRENT_MODEL });
    expect(params).not.toHaveProperty('temperature');
  });

  it('parses the verdict from a response whose first block is thinking', async () => {
    createMock.mockResolvedValue(thinkingThenTextMessage(VERDICT));
    expect(await analyze()).toMatchObject({
      engramA: 'eng_a',
      engramB: 'eng_b',
      conflict: 'A says Postgres, B says SQLite',
    });
  });
});
