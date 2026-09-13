/**
 * `hobby` is offered to the categorizer as a recognition-only axis (POPS-3675).
 *
 * A crypto wallet top-up whose honest tag is `hobby:crypto` had no axis to
 * answer on, so the model filled venue/occasion/contains with the nearest wrong
 * value. These cases pin the three halves of the change: the axis is offered
 * with the values the vocabulary already holds, a value it does not hold is
 * refused rather than coined, and tag coverage does not start counting a
 * missing hobby on every spend row. They also pin what stays out, so a later
 * edit cannot offer `tax:` before POPS-3685 decides it may.
 */
import { describe, expect, it } from 'vitest';

import { FACET_EXPECTATIONS } from '../../../../db/services/tag-coverage-expectations.js';
import { CLASSIFIED_TAG_FACETS } from '../../../../db/tag-facets.js';
import { buildPrompt } from '../ai-categorizer-api.js';
import { validateAiTags } from '../ai-tag-validation.js';
import { buildTagsOnlyPrompt } from '../ai-tags-only-api.js';

const VOCAB = ['venue:takeaway', 'contains:food', 'hobby:crypto', 'hobby:brewing'];
const INPUT = { description: 'ZENGO PTY LTD', amount: -80.32 };

describe('hobby as a classified axis', () => {
  it('is offered in the prompt with the values the vocabulary holds, as a list axis', () => {
    const prompt = buildPrompt(INPUT, VOCAB);

    expect(prompt).toContain('- hobby: any of [crypto, brewing]');
    expect(prompt).toContain('"hobby": ["..."]');
  });

  it('is offered on the tag-only shape too, which is the path the crypto row took', () => {
    const prompt = buildTagsOnlyPrompt(
      [{ entityName: 'Zengo Crypto Wallet', input: INPUT }],
      VOCAB
    );

    expect(prompt).toContain('- hobby: any of [crypto, brewing]');
  });

  it('accepts a listed hobby from the reply', () => {
    const { tags, rejected } = validateAiTags({ hobby: ['crypto'] }, VOCAB);

    expect(tags).toEqual(['hobby:crypto']);
    expect(rejected).toEqual([]);
  });

  it('refuses a hobby the vocabulary does not hold, rather than coining it', () => {
    const { tags, rejected } = validateAiTags({ hobby: ['woodwork'] }, VOCAB);

    expect(tags).toEqual([]);
    expect(rejected).toEqual([{ facet: 'hobby', value: 'woodwork', reason: 'value-not-listed' }]);
  });

  it('allows more than one hobby on a row', () => {
    expect(validateAiTags({ hobby: ['crypto', 'brewing'] }, VOCAB).tags).toEqual([
      'hobby:crypto',
      'hobby:brewing',
    ]);
  });
});

describe('what stays unclassified', () => {
  it.each(['tax', 'trip', 'asset', 'enrich', 'person', 'flag'])(
    'does not offer %s to the categorizer',
    (facet) => {
      expect(CLASSIFIED_TAG_FACETS.map((entry) => entry.facet)).not.toContain(facet);
    }
  );

  it('refuses a tax value in a reply even when the vocabulary holds it', () => {
    const { tags } = validateAiTags({ tax: ['deductible'] }, [...VOCAB, 'tax:deductible']);

    expect(tags).toEqual([]);
  });
});

describe('tag coverage', () => {
  it('does not measure hobby, so a spend row is not reported missing one', () => {
    expect(FACET_EXPECTATIONS.map((expectation) => expectation.facet)).toEqual([
      'venue',
      'occasion',
      'contains',
      'channel',
      'fee',
    ]);
  });
});
