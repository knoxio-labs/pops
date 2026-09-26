import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { coreWorld } from '../fixtures/core';
import { recentPlacements } from '../fixtures/recents';
import { defaultDrill, derivePicker, usePickerState } from './use-picker-state';

import type { PickerSubject } from '../model/contracts';
import type { PickerInput, PickerPosition } from './use-picker-state';

const TOP: PickerPosition = { query: '', drillId: null };

function input(subject: PickerSubject, canCreate = true): PickerInput {
  return { world: coreWorld, subject, recents: recentPlacements, canCreate };
}

const items = (...ids: string[]): PickerSubject => ({ kind: 'items', ids });

describe('put back', () => {
  it('offers the remembered place for an item picked up from it', () => {
    const model = derivePicker(input(items('itm-tape')), TOP);
    expect(model.putBack?.label).toBe('Red toolbox');
    expect(model.putBack?.disabledReason).toBeNull();
    expect(model.putBackGone).toBeNull();
  });

  it('names a deleted previous place instead of offering it', () => {
    const model = derivePicker(input(items('itm-headphones')), TOP);
    expect(model.putBack).toBeNull();
    expect(model.putBackGone).toBe('Spare room');
  });

  it('offers nothing for a loose item, or for a mixed selection', () => {
    expect(derivePicker(input(items('itm-torch')), TOP).putBack).toBeNull();
    expect(derivePicker(input(items('itm-tape', 'itm-screw')), TOP).putBack).toBeNull();
  });

  it('offers nothing for an item that is not in hand', () => {
    expect(derivePicker(input(items('itm-lamp')), TOP).putBack).toBeNull();
  });
});

describe('quick-pick sections', () => {
  it('caps recents at four and excludes them from five open containers', () => {
    const model = derivePicker(input(items('itm-lamp')), TOP);
    expect(model.recents.map((option) => option.label)).toEqual([
      'Kitchen 13',
      'Desk',
      'Shelving',
      'Cable tub',
    ]);
    expect(model.recents[1]?.disabledReason).toBe('Already in Desk.');
    expect(model.openContainers.map((option) => option.label)).toEqual([
      'Small parts case',
      'Bedside box',
    ]);
  });

  it('hides In hand when every selected item is already in hand', () => {
    expect(derivePicker(input(items('itm-tape')), TOP).inHand).toBeNull();
  });

  it('refuses a container inside the selected container', () => {
    const model = derivePicker(input(items('box-cables')), TOP);
    const parts = model.openContainers.find((option) => option.label === 'Small parts case');
    expect(parts?.disabledReason).toBe('Small parts case is inside Cable tub.');
  });
});

describe('tree', () => {
  it('starts at the top level and drills into a place with direct containers', () => {
    expect(derivePicker(input(items('itm-lamp')), TOP).level.map((option) => option.label)).toEqual(
      ['Wattle Street house', 'Offsite storage unit']
    );

    const garage = derivePicker(input(items('itm-lamp')), { query: '', drillId: 'loc-garage' });
    expect(garage.crumbs.map((crumb) => crumb.name)).toEqual([
      'All places',
      'Wattle Street house',
      'Garage',
    ]);
    expect(garage.level.map((option) => option.label)).toEqual([
      'Workbench',
      'Shelving',
      'Kitchen 12',
      'Office 04',
    ]);
    expect(garage.level.find((option) => option.label === 'Office 04')?.disabledReason).toBe(
      'Office 04 is closed. Open it first.'
    );
    expect(garage.level.find((option) => option.label === 'Workbench')?.drillable).toBe(true);
  });

  it('allows a place to move among places but not into itself or below it', () => {
    const model = derivePicker(input({ kind: 'place', locationId: 'loc-workbench' }), {
      query: '',
      drillId: 'loc-garage',
    });
    expect(model.level.map((option) => option.label)).toEqual(['Workbench', 'Shelving']);
    expect(model.level[0]?.disabledReason).toBe('A place cannot go inside itself.');
    expect(model.recents).toEqual([]);
    expect(model.inHand).toBeNull();

    const search = derivePicker(input({ kind: 'place', locationId: 'loc-workbench' }), {
      query: 'toolbox',
      drillId: null,
    });
    expect(search.results?.[0]?.disabledReason).toBe('A place cannot go inside itself.');
    expect(model.level.every((option) => option.kind === 'location')).toBe(true);
  });
});

describe('initial tree level', () => {
  it('opens at the current or remembered room', () => {
    expect(defaultDrill(input(items('itm-lamp')))).toBe('loc-study');
    expect(defaultDrill(input(items('itm-tape')))).toBe('loc-garage');
    expect(defaultDrill(input(items('itm-screw')))).toBe('loc-garage');
    expect(defaultDrill(input(items('itm-usbc')))).toBe('loc-garage');
  });

  it('opens at the top when no place is remembered', () => {
    expect(defaultDrill(input(items('itm-torch')))).toBeNull();
    expect(defaultDrill(input(items('itm-headphones')))).toBeNull();
    expect(defaultDrill(input(items('box-bedside')))).toBe('loc-bedroom');
    expect(defaultDrill(input(items('box-xmas')))).toBe('loc-storage-bay');
    expect(defaultDrill(input({ kind: 'place', locationId: 'loc-workbench' }))).toBe('loc-garage');
    expect(defaultDrill(input(items()))).toBeNull();
  });
});

describe('search and create', () => {
  it('ranks a name prefix above a match only in the path', () => {
    const model = derivePicker(input(items('itm-lamp')), { query: 'she', drillId: null });
    expect(model.results?.[0]?.label).toBe('Shelving');
  });

  it('offers a new place inside the drilled place', () => {
    const model = derivePicker(input(items('itm-lamp')), {
      query: ' Linen press ',
      drillId: 'loc-hall',
    });
    expect(model.results).toEqual([]);
    expect(model.create).toEqual({
      name: 'Linen press',
      parentId: 'loc-hall',
      parentName: 'Hallway',
    });
  });

  it('does not offer an existing place or a create action when creation is disabled', () => {
    expect(
      derivePicker(input(items('itm-lamp')), { query: 'pantry', drillId: null }).create
    ).toBeNull();
    expect(
      derivePicker(input(items('itm-lamp'), false), { query: 'Attic', drillId: null }).create
    ).toBeNull();
  });
});

describe('usePickerState', () => {
  it('clears the query when drilling', () => {
    const subject = input(items('itm-lamp'));
    const { result } = renderHook(() => usePickerState(subject, { query: 'gar' }));
    expect(result.current.model.results?.[0]?.label).toBe('Garage');

    act(() => result.current.drillInto('loc-garage'));

    expect(result.current.position).toEqual({ query: '', drillId: 'loc-garage' });
    expect(result.current.model.results).toBeNull();
  });
});
