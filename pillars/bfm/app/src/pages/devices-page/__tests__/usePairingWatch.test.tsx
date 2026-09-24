import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { findNewlyPairedDevice, isAwaitingRedemption, usePairingWatch } from '../usePairingWatch';

import type { PairedHandset, PairingCodeModel, PairingState } from '../usePairingCode';

function handset(id: string, overrides: Partial<PairedHandset> = {}): PairedHandset {
  return {
    id,
    name: `Phone ${id}`,
    model: 'iPhone 17',
    createdAt: '2026-08-08T12:00:00.000Z',
    lastSeenAt: '2026-08-08T12:00:00.000Z',
    revokedAt: null,
    ...overrides,
  };
}

describe('findNewlyPairedDevice', () => {
  it('finds the row that was not there before', () => {
    const found = findNewlyPairedDevice(new Set(['a']), [handset('a'), handset('b')]);
    expect(found?.id).toBe('b');
  });

  it('finds nothing when the list is unchanged', () => {
    expect(findNewlyPairedDevice(new Set(['a']), [handset('a')])).toBeNull();
  });

  it('does not celebrate a newcomer that is already revoked', () => {
    const revoked = handset('b', { revokedAt: '2026-08-08T12:01:00.000Z' });
    expect(findNewlyPairedDevice(new Set(['a']), [handset('a'), revoked])).toBeNull();
  });
});

describe('isAwaitingRedemption', () => {
  it.each<[PairingState, boolean]>([
    ['idle', false],
    ['minting', false],
    ['issued', true],
    ['expired', true],
    ['paired', false],
    ['failed', false],
  ])('%s → %s', (state, expected) => {
    expect(isAwaitingRedemption(state)).toBe(expected);
  });
});

/**
 * Driven with a stand-in model rather than the real one: what is under test is
 * the baseline — when it is taken and when it is forgotten — and a fake whose
 * state the test sets directly reaches every transition in one line each.
 */
describe('usePairingWatch', () => {
  function model(state: PairingState, complete: PairingCodeModel['complete']): PairingCodeModel {
    return {
      state,
      issued: null,
      remainingMs: 0,
      failure: null,
      paired: null,
      mint: () => {},
      dismiss: () => {},
      complete,
    };
  }

  type Props = { state: PairingState; ids: string[] | null; fetchedAt?: number; since?: number };

  function watch(complete: PairingCodeModel['complete']) {
    return renderHook(
      ({ state, ids, fetchedAt = 10, since = 0 }: Props) =>
        usePairingWatch(
          model(state, complete),
          ids === null ? null : { devices: ids.map((id) => handset(id)), fetchedAt },
          since
        ),
      { initialProps: { state: 'idle', ids: ['a'] } as Props }
    );
  }

  it('completes with the first device to appear while the code is showing', () => {
    const complete = vi.fn();
    const { rerender } = watch(complete);

    rerender({ state: 'issued', ids: ['a'] });
    expect(complete).not.toHaveBeenCalled();

    rerender({ state: 'issued', ids: ['a', 'b'], fetchedAt: 11 });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  /**
   * A list still loading has no ids; a baseline of "nothing" would read every
   * handset already paired as the new one.
   */
  it('waits for the list before taking its baseline', () => {
    const complete = vi.fn();
    const { rerender } = watch(complete);

    rerender({ state: 'issued', ids: null });
    rerender({ state: 'issued', ids: ['a'] });

    expect(complete).not.toHaveBeenCalled();
  });

  /**
   * The cache can predate a handset paired from elsewhere. A read older than
   * the mint request is never used as the baseline, so that handset cannot be
   * credited to this code when the fresh read brings it in.
   */
  it('ignores a read older than the mint request', () => {
    const complete = vi.fn();
    const { rerender } = watch(complete);

    rerender({ state: 'issued', ids: ['a'], fetchedAt: 5, since: 10 });
    rerender({ state: 'issued', ids: ['a', 'elsewhere'], fetchedAt: 12, since: 10 });
    expect(complete).not.toHaveBeenCalled();

    rerender({ state: 'issued', ids: ['a', 'elsewhere', 'phone'], fetchedAt: 14, since: 10 });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ id: 'phone' }));
  });

  it('takes a fresh baseline for each code', () => {
    const complete = vi.fn();
    const { rerender } = watch(complete);

    rerender({ state: 'issued', ids: ['a'] });
    rerender({ state: 'minting', ids: ['a', 'b'], fetchedAt: 11 });
    rerender({ state: 'issued', ids: ['a', 'b'], fetchedAt: 11 });

    expect(complete).not.toHaveBeenCalled();
  });

  it('does nothing while no code is waiting', () => {
    const complete = vi.fn();
    const { rerender } = watch(complete);

    rerender({ state: 'idle', ids: ['a', 'b'], fetchedAt: 11 });

    expect(complete).not.toHaveBeenCalled();
  });
});
