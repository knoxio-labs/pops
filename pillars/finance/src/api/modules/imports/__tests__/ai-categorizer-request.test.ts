/**
 * The categorizer request must be valid for the configured model: Haiku 4.5
 * keeps `temperature: 0` and its exact cap, while Sonnet 5.5 and Opus 5.5
 * reject a non-default temperature, think by default, and answer with a
 * leading `thinking` block (POPS-5348). Runs the real SDK against a stub
 * `fetch`, so the assertions are on the JSON body that would go on the wire.
 */
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@pops/ai-telemetry', async (importActual) => {
  const actual = await importActual<typeof import('@pops/ai-telemetry')>();
  return {
    ...actual,
    callWithLogging: async (opts: { call: () => Promise<{ response: unknown }> }) =>
      (await opts.call()).response,
  };
});

const { callRawApi } = await import('../ai-categorizer-api.js');

type Block =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string };

async function send(model: string, maxTokens: number, content: Block[]) {
  const bodies: Record<string, unknown>[] = [];
  const client = new Anthropic({
    apiKey: 'sk-test',
    maxRetries: 0,
    fetch: (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model,
            content,
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 3, output_tokens: 4 },
          }),
          { headers: { 'content-type': 'application/json' } }
        )
      );
    },
  });
  const result = await callRawApi({
    client,
    prompt: 'p',
    sanitizedDescription: 'd',
    model,
    maxTokens,
    operation: 'imports.categorize',
  });
  return { body: bodies[0], result };
}

const TEXT: Block[] = [{ type: 'text', text: '{"entityName":"X"}' }];

describe('callRawApi request shape', () => {
  it('keeps temperature 0, the given cap and no output_config for Haiku 4.5', async () => {
    const { body } = await send('claude-haiku-4-5-20251001', 200, TEXT);
    expect(body).toEqual({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      temperature: 0,
      messages: [{ role: 'user', content: 'p' }],
    });
  });

  it('sends Sonnet 5.5 no temperature, low effort and a raised cap', async () => {
    const { body } = await send('claude-sonnet-5-5', 200, TEXT);
    expect(body).not.toHaveProperty('temperature');
    expect(body?.['output_config']).toEqual({ effort: 'low' });
    expect(body?.['max_tokens']).toBe(2000);
  });

  it('keeps a batch cap that is already above the floor on Opus 5.5', async () => {
    const { body } = await send('claude-opus-5-5', 6000, TEXT);
    expect(body?.['max_tokens']).toBe(6000);
    expect(body).not.toHaveProperty('temperature');
  });

  it('reads the text block behind a leading thinking block', async () => {
    const { result } = await send('claude-sonnet-5-5', 200, [
      { type: 'thinking', thinking: 'hmm', signature: 's' },
      ...TEXT,
    ]);
    expect(result.text).toBe('{"entityName":"X"}');
  });

  it('reports null text when the reply has no text block', async () => {
    const { result } = await send('claude-sonnet-5-5', 200, [
      { type: 'thinking', thinking: 'hmm', signature: 's' },
    ]);
    expect(result.text).toBeNull();
  });
});
