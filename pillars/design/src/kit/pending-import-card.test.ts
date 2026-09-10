import { pendingImportById, type PendingImport } from '@/fixtures/pending-imports';
import { progressLine, sortPending } from '@/kit/pending-import-card';
import { describe, expect, it } from 'vitest';

const base: PendingImport = {
  id: 'p',
  accountId: 'a2',
  source: { kind: 'file', format: 'Amex activity CSV', files: ['a.csv'] },
  state: 'saved',
  step: 'Review',
  rowCount: 3,
  unresolvedCount: 1,
  savedAt: '2026-09-04T10:00:00+10:00',
};

const withState = (state: PendingImport['state'], savedAt = base.savedAt): PendingImport => ({
  ...base,
  id: `${state}-${savedAt}`,
  state,
  savedAt,
});

describe('sortPending', () => {
  it('puts what needs dealing with first: unusable, open, live, then saved', () => {
    const items = [withState('saved'), withState('live'), withState('unusable'), withState('open')];
    expect(sortPending(items).map((i) => i.state)).toEqual(['unusable', 'open', 'live', 'saved']);
  });

  it('orders equal states newest first', () => {
    const older = withState('saved', '2026-09-01T10:00:00+10:00');
    const newer = withState('saved', '2026-09-05T10:00:00+10:00');
    expect(sortPending([older, newer]).map((i) => i.id)).toEqual([newer.id, older.id]);
  });

  it('does not mutate its input', () => {
    const items = [withState('saved'), withState('unusable')];
    const before = items.map((i) => i.id);
    sortPending(items);
    expect(items.map((i) => i.id)).toEqual(before);
  });
});

describe('progressLine', () => {
  it('names the step and what is left to decide on a saved draft', () => {
    expect(progressLine(base)).toBe('3 transactions, stopped at Review · 1 still to decide.');
    expect(progressLine({ ...base, unresolvedCount: 0 })).toBe(
      '3 transactions, stopped at Review · nothing left to decide.'
    );
  });

  it('falls back to the start when a draft never reached a step', () => {
    expect(progressLine({ ...base, step: undefined, unresolvedCount: undefined })).toBe(
      '3 transactions, stopped at the start · nothing left to decide.'
    );
  });

  it('singularises one transaction', () => {
    expect(progressLine({ ...base, rowCount: 1 })).toMatch(/^1 transaction,/);
  });

  it('says a live import is waiting, or that it holds arrivals for an open one', () => {
    expect(progressLine(pendingImportById('p-up-live'))).toMatch(
      /^11 transactions arrived since .* · 2 need you\.$/
    );
    expect(progressLine({ ...pendingImportById('p-up-live'), unresolvedCount: 0 })).toMatch(
      /· waiting for review\.$/
    );
    expect(progressLine(pendingImportById('p-up-next'))).toBe(
      '4 transactions arrived after the open import was started. They are held here so it stays as you left it.'
    );
  });

  it('shows the reason on an unusable draft, with a fallback when none was given', () => {
    expect(progressLine(pendingImportById('p-anz-old'))).toMatch(/^Saved before the 2 Sep deploy/);
    expect(progressLine({ ...base, state: 'unusable' })).toBe('Cannot be resumed.');
  });
});
