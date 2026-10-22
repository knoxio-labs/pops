import { describe, expect, it, vi } from 'vitest';

import { extractWithTextFallback } from '../handlers/instagram/text-fallback.js';
import {
  extractWithClaudeVision,
  MAX_KEYFRAMES_TO_VISION,
  VisionExtractError,
} from '../handlers/instagram/vision.js';

import type { AnthropicLike, AnthropicMessage } from '../handlers/instagram/anthropic-client.js';

function clientReturning(
  jsonText: string,
  usage = { input_tokens: 100, output_tokens: 50 }
): {
  client: AnthropicLike;
  createSpy: ReturnType<typeof vi.fn>;
} {
  const message: AnthropicMessage = {
    content: [{ type: 'text', text: jsonText }],
    usage,
  };
  const createSpy = vi.fn(async () => message);
  return { client: { messages: { create: createSpy } }, createSpy };
}

const VALID_JSON = JSON.stringify({
  title: 'Test Recipe',
  servings: 2,
  ingredients: [
    {
      ingredient_slug: 'flour',
      variant_slug: null,
      prep_state_slug: null,
      qty: 200,
      unit: 'g',
      notes: null,
    },
  ],
  steps: [{ body: 'Mix everything.', duration_min: null, temperature_c: null }],
});

describe('instagram request shape', () => {
  const readImpl = vi.fn(async () => Buffer.from('fakebytes'));

  it('asks the Haiku 5.5 vision default for low effort and the 2000-token cap', async () => {
    const { client, createSpy } = clientReturning(VALID_JSON);
    await extractWithClaudeVision(
      { caption: 'cap', transcript: null, keyframePaths: ['/tmp/000.jpg'] },
      { client, readFileImpl: readImpl }
    );
    const request: unknown = createSpy.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 2000,
      output_config: { effort: 'low' },
    });
    expect(request).not.toHaveProperty('temperature');
  });

  it('sends a Haiku 4.5 vision override no effort', async () => {
    const { client, createSpy } = clientReturning(VALID_JSON);
    await extractWithClaudeVision(
      { caption: 'cap', transcript: null, keyframePaths: ['/tmp/000.jpg'] },
      { client, model: 'claude-haiku-4-5', readFileImpl: readImpl }
    );
    const request: unknown = createSpy.mock.calls[0]?.[0];
    expect(request).toMatchObject({ model: 'claude-haiku-4-5', max_tokens: 2000 });
    expect(request).not.toHaveProperty('output_config');
  });

  it('asks the Haiku 5.5 text-fallback default for low effort and the 2000-token cap', async () => {
    const { client, createSpy } = clientReturning(VALID_JSON);
    await extractWithTextFallback(
      { caption: 'A long enough caption describing a full recipe in prose.' },
      { client }
    );
    const request: unknown = createSpy.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 2000,
      output_config: { effort: 'low' },
    });
    expect(request).not.toHaveProperty('temperature');
  });
});

describe('extractWithClaudeVision', () => {
  it('caps keyframes sent to vision at MAX_KEYFRAMES_TO_VISION', async () => {
    const { client, createSpy } = clientReturning(VALID_JSON);
    const tenPaths = Array.from(
      { length: 10 },
      (_, i) => `/tmp/${i.toString().padStart(3, '0')}.jpg`
    );
    const readImpl = vi.fn(async () => Buffer.from('fakebytes'));
    const result = await extractWithClaudeVision(
      { caption: 'cap', transcript: null, keyframePaths: tenPaths },
      { client, readFileImpl: readImpl }
    );
    expect(result.keyframesSent).toBe(MAX_KEYFRAMES_TO_VISION);
    expect(readImpl).toHaveBeenCalledTimes(MAX_KEYFRAMES_TO_VISION);
    expect(createSpy).toHaveBeenCalledOnce();
  });

  it('rejects markdown-fenced responses', async () => {
    const { client } = clientReturning('```json\n' + VALID_JSON + '\n```');
    await expect(
      extractWithClaudeVision({ caption: 'cap', transcript: null, keyframePaths: [] }, { client })
    ).rejects.toBeInstanceOf(VisionExtractError);
  });

  it('rejects schema-invalid responses', async () => {
    const { client } = clientReturning('{"title": "x"}');
    await expect(
      extractWithClaudeVision({ caption: 'cap', transcript: null, keyframePaths: [] }, { client })
    ).rejects.toBeInstanceOf(VisionExtractError);
  });

  it('returns the documented telemetry fields', async () => {
    const { client } = clientReturning(VALID_JSON);
    const result = await extractWithClaudeVision(
      { caption: 'cap', transcript: 'transcript text', keyframePaths: [] },
      { client }
    );
    expect(result.model).toBeTruthy();
    expect(result.promptVersion).toBe('ig-vision-v1.0');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
  });
});
