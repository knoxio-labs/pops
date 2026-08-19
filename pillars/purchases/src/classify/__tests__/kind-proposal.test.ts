/**
 * What the model is asked, and what is accepted back.
 *
 * The property that matters most is the one a passing model hides: an
 * answer that is not a kind must leave the line alone. A parser that
 * coerced `unknown`, an out-of-range index, or a misspelling into a value
 * would write a guess into the operative column, and nothing downstream
 * could tell it from a decision.
 */
import { describe, expect, it } from 'vitest';

import { KindProposalShapeError, kindPrompt, readKindProposals } from '../kind-proposal.js';

import type { ProposalCandidate } from '../batch.js';

const asin = (value: string) => ({ value, scheme: 'asin' }) as const;

const candidate = (over: Partial<ProposalCandidate> = {}): ProposalCandidate => ({
  key: 'k1',
  source: 'amazon',
  name: 'Robot vacuum',
  sku: asin('B0ROBOT'),
  itemIds: ['i1'],
  ...over,
});

const BATCH: readonly ProposalCandidate[] = [
  candidate({ key: 'k1', name: 'Robot vacuum', sku: asin('B0ROBOT') }),
  candidate({ key: 'k2', name: 'AA batteries 24pk', sku: asin('B0AA') }),
  candidate({ key: 'k3', source: 'woolworths', name: 'Bananas', sku: null }),
];

const reply = (proposals: unknown): string => JSON.stringify({ proposals });

describe('the prompt', () => {
  it('lists every candidate under a one-based number', () => {
    const prompt = kindPrompt(BATCH);
    expect(prompt).toContain('1. (amazon) Robot vacuum [asin B0ROBOT]');
    expect(prompt).toContain('3. (woolworths) Bananas');
  });

  it('omits the sku bracket where the source states none', () => {
    const listed = kindPrompt([candidate({ sku: null, name: 'Bananas' })])
      .split('\n')
      .filter((row) => row.startsWith('1. '));
    expect(listed).toEqual(['1. (amazon) Bananas']);
  });

  it('offers unknown and tells the model when to use it', () => {
    // Without this the model always picks one of four, and the column's
    // designed-for state — NULL — becomes unreachable.
    const prompt = kindPrompt(BATCH);
    expect(prompt).toContain('unknown');
    expect(prompt).toContain('Do not guess.');
  });
});

describe('reading an answer', () => {
  it('maps numbers back onto batching keys', () => {
    const read = readKindProposals(
      reply([
        { id: 1, kind: 'durable' },
        { id: 2, kind: 'consumable' },
      ]),
      BATCH
    );
    expect([...read]).toEqual([
      ['k1', 'durable'],
      ['k2', 'consumable'],
    ]);
  });

  it('drops an explicit unknown rather than recording it', () => {
    // Absent from the map means the pass writes nothing, which is the same
    // outcome as never having asked — which is the point.
    const read = readKindProposals(reply([{ id: 3, kind: 'unknown' }]), BATCH);
    expect(read.size).toBe(0);
  });

  it('ignores an answer about a number this batch does not have', () => {
    // An off-by-one or a hallucinated index is an answer about something
    // else. Dropping it beats failing the batch that arrived with it, and
    // the pass's `undecided` count is where a systematically confused model
    // shows up.
    const read = readKindProposals(
      reply([
        { id: 9, kind: 'durable' },
        { id: 0, kind: 'durable' },
        { id: -1, kind: 'durable' },
      ]),
      BATCH
    );
    expect(read.size).toBe(0);
  });

  it('keeps the first of two contradictory answers about one number', () => {
    // Either is a guess at that point; taking the later one would make the
    // result depend on emission order, which is worse than arbitrary.
    const read = readKindProposals(
      reply([
        { id: 1, kind: 'durable' },
        { id: 1, kind: 'consumable' },
      ]),
      BATCH
    );
    expect(read.get('k1')).toBe('durable');
  });

  it('unwraps JSON a model wrapped in prose or a fence', () => {
    const read = readKindProposals(
      'Sure!\n```json\n{"proposals":[{"id":1,"kind":"durable"}]}\n```\nHope that helps.',
      BATCH
    );
    expect(read.get('k1')).toBe('durable');
  });

  it('rejects a kind outside the vocabulary rather than dropping it silently', () => {
    // Loud, because a model inventing `perishable` means the prompt and the
    // enum have drifted apart and every batch is affected, not one line.
    expect(() => readKindProposals(reply([{ id: 1, kind: 'perishable' }]), BATCH)).toThrow(
      KindProposalShapeError
    );
  });

  it('rejects an answer with no JSON in it', () => {
    expect(() => readKindProposals('I cannot help with that.', BATCH)).toThrow(
      KindProposalShapeError
    );
  });

  it('rejects JSON that does not parse', () => {
    expect(() => readKindProposals('{"proposals": [', BATCH)).toThrow(KindProposalShapeError);
  });

  it('rejects a well-formed object of the wrong shape', () => {
    expect(() => readKindProposals(JSON.stringify({ kinds: ['durable'] }), BATCH)).toThrow(
      KindProposalShapeError
    );
  });
});
