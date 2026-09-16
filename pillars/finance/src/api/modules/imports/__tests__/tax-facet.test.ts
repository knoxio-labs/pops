/**
 * `tax` is offered to the categorizer, and never ticked for the person
 * (POPS-3685).
 *
 * The axis is offered on the terms `hobby` set (existing values only, a list,
 * refused when unlisted, not measured by coverage). What it adds is the
 * pre-accept exclusion: a `tax:deductible` is a claim with consequences, so a
 * suggestion of one is left unticked however confident the model is and
 * however low the threshold is set. The cases a lenient implementation gets
 * wrong are full confidence at a zero threshold, and a suggestion with no
 * provenance, which consumers read as ticked.
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
import { FACET_EXPECTATIONS } from '../../../../db/services/tag-coverage-expectations.js';
import { isNeverPreAccepted } from '../../../../db/tag-facets.js';
import { buildAiSuggestedTags } from '../../tag-suggester/index.js';
import { buildPrompt } from '../ai-categorizer-api.js';
import { validateAiTags } from '../ai-tag-validation.js';
import { buildTagsOnlyPrompt } from '../ai-tags-only-api.js';

const VOCAB = ['venue:mechanic', 'contains:fuel', 'tax:deductible', 'tax:novated-lease'];
const INPUT = { description: 'SG FLEET LEASE', amount: -512.4 };

describe('tax as a classified axis', () => {
  it('is offered on the categorize shape with the values the vocabulary holds, as a list axis', () => {
    const prompt = buildPrompt(INPUT, VOCAB);

    expect(prompt).toContain('- tax: any of [deductible, novated-lease]');
    expect(prompt).toContain('"tax": ["..."]');
  });

  it('is offered on the tag-only shape too', () => {
    const prompt = buildTagsOnlyPrompt([{ entityName: 'SG Fleet', input: INPUT }], VOCAB);

    expect(prompt).toContain('- tax: any of [deductible, novated-lease]');
  });

  it('accepts a listed tax value from the reply', () => {
    expect(validateAiTags({ tax: ['novated-lease'] }, VOCAB)).toEqual({
      tags: ['tax:novated-lease'],
      rejected: [],
    });
  });

  it('refuses a tax value the vocabulary does not hold, rather than coining it', () => {
    const { tags, rejected } = validateAiTags({ tax: ['gst-free'] }, VOCAB);

    expect(tags).toEqual([]);
    expect(rejected).toEqual([{ facet: 'tax', value: 'gst-free', reason: 'value-not-listed' }]);
  });

  it('is not measured by tag coverage', () => {
    expect(FACET_EXPECTATIONS.map((expectation) => expectation.facet)).not.toContain('tax');
  });
});

describe('isNeverPreAccepted', () => {
  it.each(['tax:deductible', 'tax:novated-lease'])('holds %s back', (tag) => {
    expect(isNeverPreAccepted(tag)).toBe(true);
  });

  it.each(['venue:mechanic', 'hobby:brewing', 'taxi:ride', 'tax', 'deductible'])(
    'does not hold %s back',
    (tag) => {
      expect(isNeverPreAccepted(tag)).toBe(false);
    }
  );
});

describe('a tax suggestion is never pre-accepted', () => {
  let dir: string;
  let opened: OpenedFinanceDb;
  let db: FinanceDb;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tax-facet-'));
    opened = openFinanceDb(join(dir, 'finance.db'));
    db = opened.db;
  });

  afterEach(() => {
    opened.raw.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('holds a tax tag back at full confidence and a zero threshold, while its sibling is ticked', () => {
    const suggestions = buildAiSuggestedTags(
      ['contains:fuel', 'tax:deductible'],
      tagVocabularyService.loadKnownTagSet(db),
      { confidence: 1, preAcceptThreshold: 0 }
    );

    expect(suggestions).toEqual([
      expect.objectContaining({ tag: 'contains:fuel', preAccept: true }),
      expect.objectContaining({ tag: 'tax:deductible', confidence: 1, preAccept: false }),
    ]);
  });

  it('marks a tax tag held back even when the suggestion carries no provenance', () => {
    const [suggestion] = buildAiSuggestedTags(
      ['tax:novated-lease'],
      tagVocabularyService.loadKnownTagSet(db)
    );

    expect(suggestion?.preAccept).toBe(false);
  });
});
