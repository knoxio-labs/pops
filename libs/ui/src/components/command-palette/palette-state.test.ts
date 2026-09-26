import { act, renderHook } from '@testing-library/react';
import { MapPin, MoveRight, Package } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import {
  choosePaletteEntry,
  initialPaletteState,
  paletteKey,
  paletteReducer,
  usePaletteState,
} from './palette-state';

import type { PaletteCommand, PaletteSource } from './types';

const move: PaletteCommand = {
  id: 'move',
  label: 'Move',
  group: 'commands',
  icon: MoveRight,
  argument: 'destination',
};
const newItem: PaletteCommand = {
  id: 'new',
  label: 'New item',
  group: 'commands',
  icon: Package,
};
const garage: PaletteCommand = {
  id: 'garage',
  label: 'Garage',
  group: 'records',
  icon: MapPin,
};

const source: PaletteSource = {
  scopes: [
    { id: 'first', label: 'First' },
    { id: 'second', label: 'Second' },
  ],
  commands: [move, newItem],
  sections: (query, scope, step) => {
    if (step !== null) {
      return query.toLowerCase().includes('gar')
        ? [{ id: 'argument', title: step.label, entries: [garage] }]
        : [];
    }
    return scope === 'first' && query === ''
      ? [{ id: 'commands', title: 'Commands', entries: [move, newItem] }]
      : [];
  },
  placeholder: () => 'Search',
};

describe('palette state machine', () => {
  it('pushes a step for a command that needs an argument, clearing the query', () => {
    const typed = paletteReducer(initialPaletteState('first'), { type: 'query', query: 'mov' });
    const stepped = paletteReducer(typed, { type: 'push', command: move });
    expect(stepped.query).toBe('');
    expect(stepped.steps).toEqual([{ commandId: 'move', label: 'Move', argument: 'destination' }]);
    expect(paletteReducer(stepped, { type: 'push', command: newItem })).toBe(stepped);
  });

  it('pops a step on Backspace only when the query is empty', () => {
    const stepped = paletteReducer(initialPaletteState('first'), { type: 'push', command: move });
    expect(paletteKey(stepped, 'Backspace', ['first', 'second']).action).toEqual({
      type: 'pop',
    });
    expect(paletteKey({ ...stepped, query: 'g' }, 'Backspace', ['first', 'second'])).toEqual({
      action: null,
      handled: false,
      close: false,
    });
  });

  it('leaves Backspace unhandled at the root with an empty query', () => {
    expect(paletteKey(initialPaletteState('first'), 'Backspace', ['first', 'second'])).toEqual({
      action: null,
      handled: false,
      close: false,
    });
  });

  it('cycles scope on Tab in the given order and wraps, but not inside a step', () => {
    const initial = initialPaletteState('first');
    const cycled = paletteReducer(initial, {
      type: 'cycle-scope',
      scopes: ['first', 'second', 'third'],
    });
    expect(cycled.scope).toBe('second');
    expect(
      paletteReducer(cycled, {
        type: 'cycle-scope',
        scopes: ['first', 'second', 'third'],
      }).scope
    ).toBe('third');
    expect(
      paletteReducer(
        paletteReducer(cycled, {
          type: 'cycle-scope',
          scopes: ['first', 'second', 'third'],
        }),
        { type: 'cycle-scope', scopes: ['first', 'second', 'third'] }
      ).scope
    ).toBe('first');
    const stepped = paletteReducer(initial, { type: 'push', command: move });
    expect(paletteKey(stepped, 'Tab', ['first', 'second'])).toEqual({
      action: null,
      handled: true,
      close: false,
    });
  });

  it('handles Tab without cycling when there is one scope', () => {
    expect(paletteKey(initialPaletteState('first'), 'Tab', ['first'])).toEqual({
      action: null,
      handled: true,
      close: false,
    });
  });

  it('closes on Esc', () => {
    expect(paletteKey(initialPaletteState('first'), 'Escape', ['first'])).toEqual({
      action: null,
      handled: true,
      close: true,
    });
    expect(paletteKey(initialPaletteState('first'), 'a', ['first'])).toEqual({
      action: null,
      handled: false,
      close: false,
    });
  });

  it('runs a plain command, steps into an argument command, and runs the step command with its target', () => {
    expect(choosePaletteEntry(initialPaletteState('first'), newItem, source.commands)).toEqual({
      kind: 'run',
      command: newItem,
      argument: null,
    });
    expect(choosePaletteEntry(initialPaletteState('first'), move, source.commands)).toEqual({
      kind: 'step',
    });
    const stepped = paletteReducer(initialPaletteState('first'), {
      type: 'push',
      command: move,
    });
    expect(choosePaletteEntry(stepped, garage, source.commands)).toEqual({
      kind: 'run',
      command: move,
      argument: garage,
    });
  });

  it('usePaletteState steps into a command, searches its options, and backs out with Backspace', () => {
    const { result } = renderHook(() => usePaletteState(source));
    act(() => {
      result.current.choose(move);
    });
    expect(result.current.step?.label).toBe('Move');
    act(() => {
      result.current.setQuery('gar');
    });
    expect(result.current.sections[0]?.entries.map((entry) => entry.id)).toEqual(['garage']);
    act(() => {
      result.current.setQuery('');
    });
    let outcome = { handled: false, close: false };
    act(() => {
      outcome = result.current.onKey('Backspace');
    });
    expect(outcome).toEqual({ handled: true, close: false });
    expect(result.current.step).toBeNull();
  });
});
