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

  function watch(complete: PairingCodeModel['complete']) {
    return renderHook(
      ({ state, devices }: { state: PairingState; devices: PairedHandset[] | null }) =>
        usePairingWatch(model(state, complete), devices),
      { initialProps: { state: 'idle', devices: [handset('a')] } }
    );
  }

  it('completes with the first device to appear while the code is showing', () => {
    const complete = vi.fn();
    const { rerender } = watch(complete);

    rerender({ state: 'issued', devices: [handset('a')] });
    expect(complete).not.toHaveBeenCalled();

    rerender({ state: 'issued', devices: [handset('a'), handset('b')] });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  /**
   * The list can still be loading when the code appears. A baseline of
   * "nothing" would read every handset already paired as the new one.
   */
  it('waits for the list before taking its baseline', () => {
    const complete = vi.fn();
    const { rerender } = watch(complete);

    rerender({ state: 'issued', devices: null });
    rerender({ state: 'issued', devices: [handset('a')] });

    expect(complete).not.toHaveBeenCalled();
  });

  it('takes a fresh baseline for each code', () => {
    const complete = vi.fn();
    const { rerender } = watch(complete);

    rerender({ state: 'issued', devices: [handset('a')] });
    rerender({ state: 'minting', devices: [handset('a'), handset('b')] });
    rerender({ state: 'issued', devices: [handset('a'), handset('b')] });

    expect(complete).not.toHaveBeenCalled();
  });

  it('does nothing while no code is waiting', () => {
    const complete = vi.fn();
    const { rerender } = watch(complete);

    rerender({ state: 'idle', devices: [handset('a'), handset('b')] });

    expect(complete).not.toHaveBeenCalled();
  });
});
