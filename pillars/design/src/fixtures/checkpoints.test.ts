import {
  balanceAsOf,
  checkpointsByAccountId,
  checkpointsFor,
  inconsistentCheckpoint,
} from '@/fixtures/checkpoints';
import { describe, expect, it } from 'vitest';

describe('checkpointsFor', () => {
  it('returns newest first regardless of declaration order', () => {
    const dates = checkpointsFor('a1').map((c) => c.asOf);
    expect(dates).toEqual([...dates].toSorted().toReversed());
    expect(dates[0]).toBe('2026-09-01');
  });

  it('does not mutate the fixture', () => {
    const before = checkpointsByAccountId.a1?.map((c) => c.id);
    checkpointsFor('a1');
    expect(checkpointsByAccountId.a1?.map((c) => c.id)).toEqual(before);
  });

  it('is empty for an account with no checkpoints', () => {
    expect(checkpointsFor('nope')).toEqual([]);
  });
});

describe('inconsistentCheckpoint', () => {
  it('returns the latest checkpoint when it carries an expected balance', () => {
    expect(inconsistentCheckpoint('a2')?.id).toBe('c5');
  });

  it('is undefined when the latest checkpoint agrees with the ledger', () => {
    expect(inconsistentCheckpoint('a1')).toBeUndefined();
  });

  it('ignores an older flagged checkpoint once a newer consistent one re-anchors', () => {
    expect(checkpointsFor('a4').at(-1)?.expectedBalance).toBeDefined();
    expect(inconsistentCheckpoint('a4')).toBeUndefined();
  });

  it('is undefined for an account with no checkpoints', () => {
    expect(inconsistentCheckpoint('nope')).toBeUndefined();
  });
});

describe('balanceAsOf', () => {
  it('prefers the newest checkpoint over the account record', () => {
    expect(balanceAsOf({ id: 'a1', balanceAsOf: '2020-01-01' })).toBe('2026-09-01');
  });

  it('falls back to the account record without checkpoints', () => {
    expect(balanceAsOf({ id: 'nope', balanceAsOf: '2026-03-03' })).toBe('2026-03-03');
  });

  it('is undefined when neither exists', () => {
    expect(balanceAsOf({ id: 'nope' })).toBeUndefined();
  });
});
