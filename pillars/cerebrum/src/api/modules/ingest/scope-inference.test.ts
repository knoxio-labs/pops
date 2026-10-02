import { describe, expect, it } from 'vitest';

import { makeFakeIngestLlm } from '../../__tests__/test-utils.js';
import { createScopeInferenceService, topScopesByCount } from './scope-inference.js';

import type { ScopeRulesConfig } from '../engrams/scope-rules.js';

const FALLBACK = 'personal.captures';
const OPERATION = 'cerebrum.infer-scopes';

const noRulesConfig: ScopeRulesConfig = { defaults: { fallback_scope: FALLBACK }, rules: [] };

const baseInput = { body: 'Notes about karbon', type: 'note', tags: [], source: 'manual' };

function manyScopes(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `work.area${i}.topic`);
}

describe('topScopesByCount', () => {
  it('orders by count descending, breaks ties alphabetically, and caps the list', () => {
    const scopes = [
      { scope: 'b.two', count: 1 },
      { scope: 'a.one', count: 1 },
      { scope: 'c.three', count: 9 },
    ];
    expect(topScopesByCount(scopes, 2)).toEqual([
      { scope: 'c.three', count: 9 },
      { scope: 'a.one', count: 1 },
    ]);
  });

  it('defaults to 40 entries', () => {
    const scopes = Array.from({ length: 60 }, (_, i) => ({ scope: `work.s${i}`, count: i }));
    expect(topScopesByCount(scopes)).toHaveLength(40);
  });
});

describe('ScopeInferenceService prompt', () => {
  it('lists the vocabulary beyond 20 entries and tells the model to prefer existing scopes', async () => {
    let prompt = '';
    const llm = makeFakeIngestLlm({
      [OPERATION]: (req) => {
        prompt = req.prompt;
        return JSON.stringify({ scopes: ['work.new.thing'], confidence: 0.8 });
      },
    });
    const knownScopes = manyScopes(40);
    await createScopeInferenceService(noRulesConfig, llm).infer({ ...baseInput, knownScopes });

    expect(prompt).toContain(
      'Prefer one of these existing scopes; only coin a new one if none fits'
    );
    expect(prompt).toContain('work.area0.topic');
    expect(prompt).toContain('work.area39.topic');
  });
});

describe('ScopeInferenceService reconciliation post-check', () => {
  const vocabulary = [{ scope: 'work.projects.karbon', count: 5 }];

  it('snaps a near-duplicate LLM scope to the canonical one', async () => {
    const llm = makeFakeIngestLlm({
      [OPERATION]: () => JSON.stringify({ scopes: ['work.projects.karbn'], confidence: 0.8 }),
    });
    const result = await createScopeInferenceService(noRulesConfig, llm).infer({
      ...baseInput,
      vocabulary,
    });
    expect(result.scopes).toEqual(['work.projects.karbon']);
    expect(result.source).toBe('llm');
  });

  it('leaves an unrelated new scope alone', async () => {
    const llm = makeFakeIngestLlm({
      [OPERATION]: () => JSON.stringify({ scopes: ['personal.health.sleep'], confidence: 0.8 }),
    });
    const result = await createScopeInferenceService(noRulesConfig, llm).infer({
      ...baseInput,
      vocabulary,
    });
    expect(result.scopes).toEqual(['personal.health.sleep']);
  });

  it('snaps against wire-supplied knownScopes too', async () => {
    const llm = makeFakeIngestLlm({
      [OPERATION]: () => JSON.stringify({ scopes: ['work.projects.karbn'], confidence: 0.8 }),
    });
    const result = await createScopeInferenceService(noRulesConfig, llm).infer({
      ...baseInput,
      knownScopes: ['work.projects.karbon'],
    });
    expect(result.scopes).toEqual(['work.projects.karbon']);
  });
});

describe('ScopeInferenceService degraded reporting', () => {
  it.each([
    ['null response', null],
    ['unparseable response', 'not json'],
  ])('flags %s as degraded and falls back', async (_label, response) => {
    const llm = makeFakeIngestLlm({ [OPERATION]: () => response });
    const outcome = await createScopeInferenceService(noRulesConfig, llm).inferWithStatus(
      baseInput
    );
    expect(outcome.degraded).toBe(true);
    expect(outcome.inference).toEqual({ scopes: [FALLBACK], source: 'fallback', confidence: 0 });
  });

  it('does not flag a valid empty answer as degraded', async () => {
    const llm = makeFakeIngestLlm({
      [OPERATION]: () => JSON.stringify({ scopes: [], confidence: 0.1 }),
    });
    const outcome = await createScopeInferenceService(noRulesConfig, llm).inferWithStatus(
      baseInput
    );
    expect(outcome.degraded).toBe(false);
  });
});
