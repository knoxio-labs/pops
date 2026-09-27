import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { coreWorld } from '../../foundation/test-fixtures/core';
import { runPaletteAction } from './palette-actions';
import { placementArgumentCommand } from './palette-commands';

import type { NavigateFunction } from 'react-router';

import type { FixedPlacement } from '../../foundation/model/model';
import type { ItemVerbs, VerbResult } from '../../inventory-web/item-verbs';

function applied(): Promise<VerbResult> {
  return Promise.resolve({ status: 'applied', seq: 1, undo: null });
}

function fakeVerbs(): ItemVerbs {
  return {
    move: vi.fn((_id: string, _target: FixedPlacement) => applied()),
    store: vi.fn((_id: string, _target: FixedPlacement) => applied()),
    pickUp: vi.fn((_id: string) => applied()),
    putBack: vi.fn((_id: string) => applied()),
    setAccess: vi.fn((_id: string, _access: 'open' | 'closed') => applied()),
    setFull: vi.fn((_id: string, _full: boolean) => applied()),
    setLifecycle: vi.fn(
      (
        _id: string,
        _lifecycle: Parameters<ItemVerbs['setLifecycle']>[1],
        _reason: Parameters<ItemVerbs['setLifecycle']>[2]
      ) => applied()
    ),
    restore: vi.fn((_id: string) => applied()),
    setQuantity: vi.fn((_id: string, _quantity: number) => applied()),
    split: vi.fn((_id: string, _quantity: number) => applied()),
    setCode: vi.fn((_id: string, _code: string | null) => applied()),
    edit: vi.fn((_id: string, _changes: Parameters<ItemVerbs['edit']>[1]) => applied()),
  };
}

function context(overrides: Partial<Parameters<typeof runPaletteAction>[0]> = {}) {
  const destinations: string[] = [];
  const navigate: NavigateFunction = (to) => {
    if (typeof to === 'string') destinations.push(to);
  };
  const onClose = vi.fn();
  const verbs = fakeVerbs();
  return {
    action: { kind: 'navigate' as const, href: '/inventory/items' },
    argument: null,
    inputQuery: '',
    navigate,
    onClose,
    verbs,
    world: coreWorld,
    destinations,
    ...overrides,
  };
}

describe('inventory palette actions', () => {
  it('navigates and closes the palette for a selected command', () => {
    const state = context();

    runPaletteAction(state);

    expect(state.destinations).toEqual(['/inventory/items']);
    expect(state.onClose).toHaveBeenCalledOnce();
  });

  it('passes a selected placement argument to the existing move verb', async () => {
    const verbs = fakeVerbs();
    const target = placementArgumentCommand(
      { kind: 'location', locationId: 'loc-kitchen' },
      coreWorld
    );
    const state = context({
      action: { kind: 'move', itemId: 'itm-tv' },
      argument: target,
      verbs,
    });

    runPaletteAction(state);
    await act(async () => undefined);

    expect(verbs.move).toHaveBeenCalledWith('itm-tv', {
      kind: 'location',
      locationId: 'loc-kitchen',
    });
    expect(state.onClose).toHaveBeenCalledOnce();
  });

  it('keeps the palette open when Move has no destination argument', () => {
    const state = context({ action: { kind: 'move', itemId: 'itm-tv' } });

    runPaletteAction(state);

    expect(state.verbs.move).not.toHaveBeenCalled();
    expect(state.onClose).not.toHaveBeenCalled();
  });
});
