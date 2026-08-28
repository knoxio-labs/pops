/**
 * Golden test for the categorizer prompt's tag half (POPS-2606).
 *
 * The prompt used to hand the model an open tag list and an explicit licence to
 * coin values ("You MAY suggest new tags not in the list"). Combined with a
 * vocabulary that fed committed tags back into the next prompt, that made the
 * taxonomy ratchet: 83 distinct tags over 569 transactions, `Toll` beside
 * `Tolls`, `Fee` beside `Fees`.
 *
 * This asserts the shape that replaced it — one enumerated field per closed
 * namespace — and, more importantly, that the shape stays replaced. An edit
 * that reintroduces free-text tagging fails here loudly rather than quietly
 * changing what is sent to Claude.
 */
import { describe, expect, it } from 'vitest';

import { buildPrompt } from '../ai-categorizer-api.js';
import { buildBatchPrompt } from '../ai-categorizer-batch-api.js';
import { EmptyClosedVocabularyError, TAGS_RULES } from '../ai-categorizer-prompt.js';

const VOCAB = [
  'contains:groceries',
  'contains:food',
  'venue:supermarket',
  'venue:cafe',
  'occasion:home',
  'occasion:out',
  'channel:online',
  'fee:surcharge',
];

const PROMPTS: [string, () => string][] = [
  ['single-row', () => buildPrompt({ description: 'WOOLWORTHS 2246' }, VOCAB)],
  ['batch', () => buildBatchPrompt([{ description: 'WOOLWORTHS 2246' }], VOCAB)],
];

describe.each(PROMPTS)('%s prompt — closed-namespace classification', (_name, build) => {
  it('renders one enumerated field per closed facet', () => {
    const prompt = build();

    expect(prompt).toContain('- venue: exactly one of [supermarket, cafe]');
    expect(prompt).toContain('- occasion: exactly one of [home, out]');
    expect(prompt).toContain('- contains: any of [groceries, food]');
    expect(prompt).toContain('- channel: exactly one of [online]');
    expect(prompt).toContain('- fee: any of [surcharge]');
  });

  it('asks for the facet fields in the reply shape, not a tags array', () => {
    const prompt = build();

    expect(prompt).toContain('"venue": "..." | null');
    expect(prompt).toContain('"contains": ["..."]');
    expect(prompt).not.toContain('"tags": ["tag1", "tag2"]');
  });

  it('states the cardinality of a single-valued facet in words as well as shape', () => {
    expect(build()).toMatch(/occasion: exactly one of/);
  });

  it('never invites the model to coin a value', () => {
    const prompt = build().toLowerCase();

    expect(prompt).not.toContain('you may suggest new tags');
    expect(prompt).not.toMatch(/new tags? not in the list/);
    expect(prompt).not.toMatch(/prefer tags from/);
  });

  it('carries no value that is absent from the vocabulary it was given', () => {
    const prompt = build();
    const listed = [...prompt.matchAll(/^- \w+: (?:exactly one|any) of \[(.*)\]$/gm)].flatMap(
      (match) => (match[1] ?? '').split(', ')
    );
    const allowed = new Set(VOCAB.map((tag) => tag.split(':')[1]));

    expect(listed.length).toBeGreaterThan(0);
    for (const value of listed) expect(allowed.has(value)).toBe(true);
  });

  it('reintroduces none of the pre-migration flat taxonomy', () => {
    const prompt = build();

    for (const legacy of ['Dining', 'Groceries', 'Subscriptions', 'Entertainment', 'Shopping']) {
      expect(prompt).not.toContain(legacy);
    }
  });

  it('refuses to build a prompt at all when the closed vocabulary is empty', () => {
    expect(() => buildPrompt({ description: 'X' }, [])).toThrow(EmptyClosedVocabularyError);
    expect(() => buildBatchPrompt([{ description: 'X' }], [])).toThrow(EmptyClosedVocabularyError);
  });

  it('drops a facet the vocabulary has no values for rather than offering an empty list', () => {
    const prompt = buildPrompt({ description: 'X' }, ['venue:cafe']);

    expect(prompt).toContain('- venue: exactly one of [cafe]');
    expect(prompt).not.toContain('- occasion:');
    expect(prompt).not.toMatch(/^- \w+: (?:exactly one|any) of \[\]$/m);
  });

  it('presents the values in the order it was given them — the usage ranking', () => {
    const prompt = buildPrompt({ description: 'X' }, [
      'contains:coffee',
      'contains:food',
      'contains:groceries',
    ]);

    expect(prompt).toContain('- contains: any of [coffee, food, groceries]');
  });
});

describe('TAGS_RULES', () => {
  it('forbids invention in the rule block itself, not only in the field list', () => {
    expect(TAGS_RULES).toMatch(/do NOT invent a value/);
    expect(TAGS_RULES).toMatch(/closed set/);
    expect(TAGS_RULES.toLowerCase()).not.toContain('you may suggest');
  });
});
