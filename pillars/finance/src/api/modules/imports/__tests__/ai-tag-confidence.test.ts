/**
 * Tag confidence, from the model's reply to the pre-accept decision
 * (POPS-3671).
 *
 * A suggestion used to be ticked for the person whatever the model thought of
 * it: the only confidence asked for was about the merchant, and nothing read
 * it. These cases pin the chain that replaced that — the prompts ask for a
 * confidence in the tags, the parsers keep a valid one and refuse to invent one,
 * and a suggestion is pre-accepted only when a reported confidence meets the
 * threshold. The boundary and the missing-confidence case are the two a lenient
 * implementation gets wrong.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openFinanceDb,
  tagVocabularyService,
  type FinanceDb,
  type OpenedFinanceDb,
} from '../../../../db/index.js';
import { buildAiSuggestedTags } from '../../tag-suggester/index.js';
import { buildPrompt, entryFromParsed, parseConfidence } from '../ai-categorizer-api.js';
import { buildBatchPrompt } from '../ai-categorizer-batch-api.js';
import { buildTagsOnlyPrompt, parseTagsOnlyEntries } from '../ai-tags-only-api.js';

const VOCAB = ['venue:supermarket', 'contains:groceries'];

describe('the prompts ask for a confidence in the tags', () => {
  it('asks both categorize shapes for tagConfidence beside the merchant confidence', () => {
    for (const prompt of [
      buildPrompt({ description: 'WOOLWORTHS' }, VOCAB),
      buildBatchPrompt([{ description: 'WOOLWORTHS' }], VOCAB),
    ]) {
      expect(prompt).toContain('"confidence": 0.0-1.0, "tagConfidence": 0.0-1.0');
      expect(prompt).toContain('tagConfidence (0.0-1.0) is your confidence that every tag');
    }
  });

  it('asks the tag-only shape for a confidence, and nothing about a merchant', () => {
    const prompt = buildTagsOnlyPrompt(
      [{ entityName: 'Woolworths', input: { description: 'WOOLWORTHS' } }],
      VOCAB
    );

    expect(prompt).toContain('"confidence": 0.0-1.0');
    expect(prompt).not.toContain('tagConfidence');
  });
});

describe('parseConfidence', () => {
  it.each([
    [0, 0],
    [0.42, 0.42],
    [1, 1],
  ])('keeps %s', (raw, expected) => {
    expect(parseConfidence(raw)).toBe(expected);
  });

  it.each([
    ['a string', '0.9'],
    ['above one', 1.2],
    ['below zero', -0.1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['null', null],
    ['absent', undefined],
  ])('refuses %s', (_label, raw) => {
    expect(parseConfidence(raw)).toBeUndefined();
  });
});

describe('parsing a tag confidence from a reply', () => {
  it('carries a valid tagConfidence on a categorize entry', () => {
    const entry = entryFromParsed(
      { entityName: 'Woolworths', venue: 'supermarket', confidence: 0.9, tagConfidence: 0.35 },
      VOCAB
    );

    expect(entry.tagConfidence).toBe(0.35);
    expect(entry.confidence).toBe(0.9);
  });

  it('leaves tagConfidence absent when the reply omits it, rather than defaulting it', () => {
    const entry = entryFromParsed({ entityName: 'Woolworths', venue: 'supermarket' }, VOCAB);

    expect(entry).not.toHaveProperty('tagConfidence');
    // The merchant confidence keeps its existing fallback; only the tag one has none.
    expect(entry.confidence).toBe(0.7);
  });

  it('carries a valid confidence on a tag-only entry and drops an invalid one', () => {
    const entries = parseTagsOnlyEntries(
      '[{"n": 1, "venue": "supermarket", "confidence": 0.8}, {"n": 2, "venue": "supermarket", "confidence": "high"}]',
      2,
      VOCAB
    );

    expect(entries[0]?.confidence).toBe(0.8);
    expect(entries[1]).not.toHaveProperty('confidence');
  });
});

describe('the pre-accept decision', () => {
  let tmpDir: string;
  let opened: OpenedFinanceDb;
  let db: FinanceDb;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'finance-ai-tag-confidence-test-'));
    opened = openFinanceDb(join(tmpDir, 'finance.db'));
    db = opened.db;
  });

  afterEach(() => {
    opened.raw.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function decide(confidence: number | undefined, preAcceptThreshold: number) {
    const [suggestion] = buildAiSuggestedTags(
      ['venue:supermarket'],
      tagVocabularyService.loadKnownTagSet(db),
      { confidence, preAcceptThreshold }
    );
    return suggestion;
  }

  it('pre-accepts a suggestion whose confidence meets the threshold exactly', () => {
    expect(decide(0.8, 0.8)?.preAccept).toBe(true);
  });

  it('does not pre-accept a suggestion just below the threshold', () => {
    expect(decide(0.79, 0.8)?.preAccept).toBe(false);
  });

  it('does not pre-accept a suggestion that carries no confidence, however low the threshold', () => {
    const suggestion = decide(undefined, 0);

    expect(suggestion?.preAccept).toBe(false);
    expect(suggestion).not.toHaveProperty('confidence');
  });

  it('pre-accepts any reported confidence at a threshold of zero', () => {
    expect(decide(0, 0)?.preAccept).toBe(true);
  });

  it('stamps the confidence it decided on, so the chip can show it', () => {
    expect(decide(0.42, 0.8)).toMatchObject({ confidence: 0.42, preAccept: false });
  });

  it('adds no pre-accept decision at all when there is no provenance', () => {
    const [suggestion] = buildAiSuggestedTags(
      ['venue:supermarket'],
      tagVocabularyService.loadKnownTagSet(db)
    );

    expect(suggestion).not.toHaveProperty('preAccept');
  });
});
