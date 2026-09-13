/**
 * Golden test for how each tag prompt frames an axis (POPS-3667).
 *
 * All three shapes opened with an instruction to classify on every axis, and
 * the only permission to leave one empty sat in the last paragraph. The opening
 * won: a crypto wallet top-up came back with a value on every axis, none of
 * them true. These assertions pin the replacement — no "every axis" imperative
 * anywhere, the permission stated before the axis list rather than after it,
 * and a single-valued axis capped rather than required — so a later edit that
 * restores the old framing fails here instead of in the suggestions.
 */
import { describe, expect, it } from 'vitest';

import { buildPrompt } from '../ai-categorizer-api.js';
import { buildBatchPrompt } from '../ai-categorizer-batch-api.js';
import { AXIS_OPTIONALITY } from '../ai-categorizer-prompt.js';
import { buildTagsOnlyPrompt } from '../ai-tags-only-api.js';

const VOCAB = ['venue:takeaway', 'occasion:out', 'contains:food', 'channel:in-person'];
const INPUT = { description: 'ZENGO PTY LTD', amount: -80.32, date: '2026-04-27' };

const PROMPTS: [string, () => string][] = [
  ['single-row', () => buildPrompt(INPUT, VOCAB)],
  ['batch', () => buildBatchPrompt([INPUT], VOCAB)],
  [
    'tag-only',
    () => buildTagsOnlyPrompt([{ entityName: 'Zengo Crypto Wallet', input: INPUT }], VOCAB),
  ],
];

describe.each(PROMPTS)('%s prompt — axis framing', (_name, build) => {
  it('never instructs the model to classify on every axis', () => {
    const prompt = build();

    expect(prompt).not.toMatch(/every tag axis/i);
    expect(prompt).not.toMatch(/on each tag axis/i);
    expect(prompt).not.toContain('classify EACH one');
  });

  it('states that an empty axis is correct before the transaction and the axis list', () => {
    const prompt = build();
    const permission = prompt.indexOf(AXIS_OPTIONALITY);

    expect(permission).toBeGreaterThan(-1);
    expect(permission).toBeLessThan(prompt.indexOf('Description: ZENGO PTY LTD'));
    expect(permission).toBeLessThan(prompt.indexOf('Tag axes and their available values:'));
  });

  it('caps a single-valued axis rather than requiring a value on it', () => {
    const prompt = build();

    expect(prompt).toContain('- venue: at most one of [takeaway]');
    expect(prompt).not.toContain('exactly one of');
  });

  it('still offers null in the reply shape of a single-valued axis', () => {
    expect(build()).toContain('"venue": "..." | null');
  });
});

describe('AXIS_OPTIONALITY', () => {
  it('names both empty forms, so a list axis is not answered with null', () => {
    expect(AXIS_OPTIONALITY).toContain('null');
    expect(AXIS_OPTIONALITY).toContain('[]');
  });
});
