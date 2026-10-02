import { describe, expect, it } from 'vitest';

import { computeConfidence } from '../confidence.js';
import { buildQuerySystemPrompt, INSUFFICIENT_INFORMATION_PHRASE } from '../prompts.js';

import type { RetrievalResult } from '../../retrieval/types.js';
import type { SourceCitation } from '../types.js';

function retrieved(
  id: string,
  matchType: RetrievalResult['matchType'],
  score = 0.016
): RetrievalResult {
  return {
    sourceType: 'engram',
    sourceId: id,
    title: id,
    contentPreview: '',
    score,
    matchType,
    metadata: {},
  };
}

function citation(id: string): SourceCitation {
  return { id, type: 'engram', title: id, excerpt: '', relevance: 0.016, scope: 'work' };
}

describe('computeConfidence', () => {
  it('is low with no valid citation, however many sources were retrieved', () => {
    const sources = [retrieved('a', 'semantic'), retrieved('b', 'semantic')];
    expect(computeConfidence('An uncited claim.', [], sources)).toBe('low');
  });

  it('is high with two valid citations when one cites a semantically matched source', () => {
    const sources = [retrieved('a', 'semantic'), retrieved('b', 'structured')];
    expect(computeConfidence('Yes [a] [b].', [citation('a'), citation('b')], sources)).toBe('high');
  });

  it('counts a source both legs agreed on as semantically matched', () => {
    const sources = [retrieved('a', 'both'), retrieved('b', 'structured')];
    expect(computeConfidence('Yes [a] [b].', [citation('a'), citation('b')], sources)).toBe('high');
  });

  it('is high on lexical hits alone when a cited one scores at least half the best hit', () => {
    const sources = [retrieved('a', 'lexical', 0.5), retrieved('b', 'lexical', 0.1)];
    expect(computeConfidence('Yes [a] [b].', [citation('a'), citation('b')], sources)).toBe('high');
  });

  it('is medium when every cited lexical hit scores under half the best hit', () => {
    const sources = [
      retrieved('top', 'lexical', 1),
      retrieved('a', 'lexical', 0.49),
      retrieved('b', 'lexical', 0.1),
    ];
    expect(computeConfidence('Yes [a] [b].', [citation('a'), citation('b')], sources)).toBe(
      'medium'
    );
  });

  it('is medium with a single citation to the best lexical hit', () => {
    const sources = [retrieved('a', 'lexical', 1), retrieved('b', 'lexical', 0.8)];
    expect(computeConfidence('Yes [a].', [citation('a')], sources)).toBe('medium');
  });

  it('is medium with a single valid citation', () => {
    const sources = [retrieved('a', 'semantic'), retrieved('b', 'semantic')];
    expect(computeConfidence('Yes [a].', [citation('a')], sources)).toBe('medium');
  });

  it('is medium when no cited source was semantically matched', () => {
    const sources = [
      retrieved('a', 'structured'),
      retrieved('b', 'structured'),
      retrieved('c', 'semantic'),
    ];
    expect(computeConfidence('Yes [a] [b].', [citation('a'), citation('b')], sources)).toBe(
      'medium'
    );
  });

  it('is low when the answer says it lacks the information, even with citations', () => {
    const sources = [retrieved('a', 'semantic'), retrieved('b', 'semantic')];
    const answer = `${INSUFFICIENT_INFORMATION_PHRASE} to answer that fully. [a] [b]`;
    expect(computeConfidence(answer, [citation('a'), citation('b')], sources)).toBe('low');
  });

  it('recognises the phrase with a typographic apostrophe and different casing', () => {
    const sources = [retrieved('a', 'semantic'), retrieved('b', 'semantic')];
    const answer = 'i don’t have enough information to answer that fully. [a] [b]';
    expect(computeConfidence(answer, [citation('a'), citation('b')], sources)).toBe('low');
  });

  it('looks for the phrase the prompt actually instructs the model to use', () => {
    expect(buildQuerySystemPrompt('ctx')).toContain(
      `"${INSUFFICIENT_INFORMATION_PHRASE} to answer that fully."`
    );
  });
});
