import { act, renderHook } from '@testing-library/react';
import { Box, MapPin, MoveRight, Package } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { buildSections, rankEntries, rankMatch } from './palette-groups';
import {
  INITIAL_PALETTE,
  choosePaletteEntry,
  paletteKey,
  paletteReducer,
  usePaletteState,
} from './use-palette-state';

import type { PaletteCommand } from '../shared/contracts';
import type { PaletteSource } from './palette-groups';

const move: PaletteCommand = {
  id: 'move',
  label: 'Move',
  group: 'commands',
  icon: MoveRight,
  argument: 'placement',
};
const newItem: PaletteCommand = { id: 'new', label: 'New item', group: 'commands', icon: Package };
const goItems: PaletteCommand = { id: 'go-items', label: 'Items', group: 'jump-to', icon: Package };
const thisMove: PaletteCommand = {
  id: 'this-move',
  label: 'Move this item',
  group: 'this-item',
  icon: MoveRight,
  argument: 'placement',
};
const record = (id: string, label: string, keywords: string[] = []): PaletteCommand => ({
  id,
  label,
  group: 'records',
  icon: Box,
  keywords,
});
const garage: PaletteCommand = {
  id: 'loc-garage',
  label: 'Garage',
  group: 'records',
  icon: MapPin,
};

const source: PaletteSource = {
  commands: [move, newItem, goItems, thisMove],
  inventoryRecords: [
    record('a', 'Cable tub', ['T02']),
    record('b', 'HDMI cable 2 m'),
    record('c', 'Kettle', ['cable drawer']),
  ],
  purchaseRecords: [record('p', 'Cable organiser, Kmart')],
  recents: [record('k12', 'Kitchen 12')],
  arguments: { placement: [garage, { ...garage, id: 'loc-desk', label: 'Desk' }] },
};

describe('ranking', () => {
  it('ranks a label prefix, then a word prefix, above contains, above another field', () => {
    expect(rankMatch('cab', 'Cable tub')).toBe(3);
    expect(rankMatch('cab', 'HDMI cable')).toBe(3);
    expect(rankMatch('abl', 'Cable tub')).toBe(2);
    expect(rankMatch('t02', 'Cable tub', ['T02'])).toBe(1);
    expect(rankMatch('zzz', 'Cable tub', ['T02'])).toBe(0);
  });

  it('ignores case and accents, and treats an empty query as a match', () => {
    expect(rankMatch('CAFE', 'Café table')).toBe(3);
    expect(rankMatch('  ', 'Anything')).toBe(1);
  });

  it('orders by rank and keeps source order within a rank', () => {
    expect(rankEntries('cable', source.inventoryRecords).map((entry) => entry.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(rankEntries('drawer', source.inventoryRecords).map((entry) => entry.id)).toEqual(['c']);
  });
});

describe('sections', () => {
  it('shows recents, this item and commands before anything is typed', () => {
    expect(buildSections('', 'inventory', null, source).map((s) => s.id)).toEqual([
      'recents',
      'this-item',
      'commands',
    ]);
  });

  it('searches this item, records, commands and pages as you type, dropping empty groups', () => {
    const sections = buildSections('item', 'inventory', null, source);
    expect(sections.map((s) => s.id)).toEqual(['this-item', 'commands', 'jump-to']);
    expect(buildSections('qqq', 'inventory', null, source)).toEqual([]);
  });

  it('searches only purchases in the Purchases scope', () => {
    const sections = buildSections('cable', 'purchases', null, source);
    expect(sections.map((s) => s.entries.map((entry) => entry.id))).toEqual([['p']]);
  });

  it('shows only the argument options during a step, titled by the command', () => {
    const step = { commandId: 'move', label: 'Move', argument: 'placement' as const };
    const sections = buildSections('de', 'inventory', step, source);
    expect(sections).toEqual([
      { id: 'argument', title: 'Move', entries: [expect.objectContaining({ id: 'loc-desk' })] },
    ]);
  });
});

describe('palette state machine', () => {
  it('pushes a step for a command that needs an argument, clearing the query', () => {
    const typed = paletteReducer(INITIAL_PALETTE, { type: 'query', query: 'mov' });
    const stepped = paletteReducer(typed, { type: 'push', command: move });
    expect(stepped.query).toBe('');
    expect(stepped.steps).toEqual([{ commandId: 'move', label: 'Move', argument: 'placement' }]);
    expect(paletteReducer(stepped, { type: 'push', command: newItem })).toBe(stepped);
  });

  it('pops a step on Backspace only when the query is empty', () => {
    const stepped = paletteReducer(INITIAL_PALETTE, { type: 'push', command: move });
    expect(paletteKey(stepped, 'Backspace').action).toEqual({ type: 'pop' });
    expect(paletteKey({ ...stepped, query: 'g' }, 'Backspace')).toEqual({
      action: null,
      handled: false,
      close: false,
    });
    expect(paletteKey(INITIAL_PALETTE, 'Backspace').action).toBeNull();
  });

  it('cycles scope on Tab, but not inside a step', () => {
    const cycled = paletteReducer(INITIAL_PALETTE, { type: 'cycle-scope' });
    expect(cycled.scope).toBe('purchases');
    expect(paletteReducer(cycled, { type: 'cycle-scope' }).scope).toBe('inventory');
    const stepped = paletteReducer(INITIAL_PALETTE, { type: 'push', command: move });
    expect(paletteKey(stepped, 'Tab')).toEqual({ action: null, handled: true, close: false });
    expect(paletteReducer(stepped, { type: 'cycle-scope' }).scope).toBe('inventory');
  });

  it('closes on Esc', () => {
    expect(paletteKey(INITIAL_PALETTE, 'Escape')).toEqual({
      action: null,
      handled: true,
      close: true,
    });
    expect(paletteKey(INITIAL_PALETTE, 'a')).toEqual({
      action: null,
      handled: false,
      close: false,
    });
  });

  it('runs a plain command, steps into an argument command, and runs the step command with its target', () => {
    expect(choosePaletteEntry(INITIAL_PALETTE, newItem, source)).toEqual({
      kind: 'run',
      command: newItem,
      argument: null,
    });
    expect(choosePaletteEntry(INITIAL_PALETTE, move, source)).toEqual({ kind: 'step' });
    const stepped = paletteReducer(INITIAL_PALETTE, { type: 'push', command: move });
    expect(choosePaletteEntry(stepped, garage, source)).toEqual({
      kind: 'run',
      command: move,
      argument: garage,
    });
  });
});

describe('usePaletteState', () => {
  it('steps into Move, searches its targets, and backs out with Backspace', () => {
    const { result } = renderHook(() => usePaletteState(source));
    act(() => {
      result.current.choose(move);
    });
    expect(result.current.step?.label).toBe('Move');
    act(() => result.current.setQuery('gar'));
    expect(result.current.sections[0]?.entries.map((entry) => entry.id)).toEqual(['loc-garage']);
    act(() => result.current.setQuery(''));
    let outcome = { handled: false, close: false };
    act(() => {
      outcome = result.current.onKey('Backspace');
    });
    expect(outcome).toEqual({ handled: true, close: false });
    expect(result.current.step).toBeNull();
  });
});
