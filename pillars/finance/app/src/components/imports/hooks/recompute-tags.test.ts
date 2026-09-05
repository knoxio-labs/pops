import { describe, expect, it } from 'vitest';

import { applyRecomputedTags, isPersistedEntityId, mergeRecomputedTags } from './recompute-tags';

import type { SuggestedTag } from '@pops/finance';

import type { ProcessedTransaction } from '../../../store/importStore';
import type { LocalTxState } from './local-tx-reconcile';

function makeProcessed(
  checksum: string,
  overrides: Partial<ProcessedTransaction> = {}
): ProcessedTransaction {
  return {
    date: '2026-02-06',
    description: `TXN ${checksum}`,
    amount: -12.5,
    dialectAccountLabel: 'Amex',
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
    entity: { matchType: 'none' },
    status: 'uncertain',
    ...overrides,
  };
}

function emptyState(overrides: Partial<LocalTxState> = {}): LocalTxState {
  return { matched: [], uncertain: [], failed: [], skipped: [], ...overrides };
}

const tags = (list: SuggestedTag[]): string[] => list.map((s) => s.tag);

describe('isPersistedEntityId', () => {
  it('rejects a locally-minted pending entity, which no rule or default can name', () => {
    expect(isPersistedEntityId('temp:entity:sauna-x')).toBe(false);
  });

  it('accepts a committed contact id', () => {
    expect(isPersistedEntityId('ent-sauna')).toBe(true);
  });
});

describe('mergeRecomputedTags', () => {
  // The reported defect: the row was processed with `entityId: null`, so the
  // entity-default pass never ran and it reached Tag Review with nothing.
  it('adopts the new entity defaults on a row that had no suggestions at all', () => {
    const merged = mergeRecomputedTags(undefined, [{ tag: 'sauna', source: 'entity' }]);
    expect(merged).toEqual([{ tag: 'sauna', source: 'entity' }]);
  });

  it('drops the previous entity defaults and takes the new ones', () => {
    const merged = mergeRecomputedTags(
      [
        { tag: 'groceries', source: 'rule', pattern: 'WOOLWORTHS' },
        { tag: 'supermarket', source: 'entity' },
      ],
      [
        { tag: 'groceries', source: 'rule', pattern: 'WOOLWORTHS' },
        { tag: 'wellness', source: 'entity' },
      ]
    );
    expect(tags(merged)).toEqual(['groceries', 'wellness']);
    expect(merged.some((s) => s.tag === 'supermarket')).toBe(false);
  });

  it('preserves the AI pass, which the lookup endpoint cannot reproduce', () => {
    const merged = mergeRecomputedTags(
      [{ tag: 'dining', source: 'ai', isNew: true }],
      [{ tag: 'wellness', source: 'entity' }]
    );
    expect(merged).toEqual([
      { tag: 'dining', source: 'ai', isNew: true },
      { tag: 'wellness', source: 'entity' },
    ]);
  });

  // A tag rule that only exists in an un-persisted ChangeSet is invisible to
  // the read-only endpoint, so stripping every rule tag would silently lose it.
  it('keeps a rule tag the fresh lookup did not return', () => {
    const merged = mergeRecomputedTags(
      [{ tag: 'pending-rule-tag', source: 'rule', pattern: 'SAUNA' }],
      [{ tag: 'wellness', source: 'entity' }]
    );
    expect(tags(merged)).toEqual(['pending-rule-tag', 'wellness']);
  });

  it('reproduces the server priority — a rule tag outranks the same tag as an entity default', () => {
    const merged = mergeRecomputedTags(undefined, [
      { tag: 'wellness', source: 'rule', pattern: 'SAUNA' },
      { tag: 'wellness', source: 'entity' },
    ]);
    expect(merged).toEqual([{ tag: 'wellness', source: 'rule', pattern: 'SAUNA' }]);
  });

  it('lets an existing AI tag keep its provenance when the new entity defaults repeat it', () => {
    const merged = mergeRecomputedTags(
      [{ tag: 'wellness', source: 'ai' }],
      [{ tag: 'wellness', source: 'entity' }]
    );
    expect(merged).toEqual([{ tag: 'wellness', source: 'ai' }]);
  });

  // The pending-entity path: nothing to look up, but the previous merchant's
  // defaults still have to go.
  it('strips entity defaults when there is nothing fresh to merge', () => {
    const merged = mergeRecomputedTags(
      [
        { tag: 'groceries', source: 'rule', pattern: 'WOOLWORTHS' },
        { tag: 'supermarket', source: 'entity' },
      ],
      []
    );
    expect(merged).toEqual([{ tag: 'groceries', source: 'rule', pattern: 'WOOLWORTHS' }]);
  });
});

describe('applyRecomputedTags', () => {
  it('rewrites the addressed row wherever it sits and leaves the rest alone', () => {
    const target = makeProcessed('sauna', { status: 'matched', suggestedTags: [] });
    const sibling = makeProcessed('other', { status: 'matched' });
    const prev = emptyState({ matched: [sibling, target], skipped: [makeProcessed('skip')] });

    const next = applyRecomputedTags(
      prev,
      new Map([['sauna', [{ tag: 'wellness', source: 'entity' } satisfies SuggestedTag]]])
    );

    expect(next.matched[1]?.suggestedTags).toEqual([{ tag: 'wellness', source: 'entity' }]);
    expect(next.matched[0]).toBe(sibling);
    expect(next.skipped).toBe(prev.skipped);
  });

  // The fetch is asynchronous, so the row object may have been replaced by a
  // server reevaluation in the meantime: the merge must read the live row.
  it('merges against the row currently in state, not the one the lookup started from', () => {
    const reevaluated = makeProcessed('sauna', {
      status: 'matched',
      suggestedTags: [{ tag: 'dining', source: 'ai' }],
    });
    const prev = emptyState({ matched: [reevaluated] });

    const next = applyRecomputedTags(
      prev,
      new Map([['sauna', [{ tag: 'wellness', source: 'entity' } satisfies SuggestedTag]]])
    );

    expect(tags(next.matched[0]?.suggestedTags ?? [])).toEqual(['dining', 'wellness']);
  });

  it('returns the state untouched when nothing was recomputed', () => {
    const prev = emptyState({ matched: [makeProcessed('sauna')] });
    expect(applyRecomputedTags(prev, new Map())).toBe(prev);
  });

  it('leaves a bucket referentially intact when it holds no addressed row', () => {
    const prev = emptyState({
      matched: [makeProcessed('sauna', { status: 'matched' })],
      uncertain: [makeProcessed('other')],
    });
    const next = applyRecomputedTags(prev, new Map([['sauna', []]]));
    expect(next.uncertain).toBe(prev.uncertain);
    expect(next.matched).not.toBe(prev.matched);
  });
});
