import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model';
import { fixtureOptions, itemOptions, optionsWorld } from './connect-dialog-options';

import type { ItemRowModel, LocationModel } from '../../foundation/model/model';
import type { FixtureListRow } from '../../inventory-web/useFixtures';

const home: LocationModel = { id: 'home', name: 'Home', parentId: null, kind: 'property' };
const bedroom: LocationModel = { id: 'bedroom', name: 'Bedroom', parentId: 'home', kind: 'room' };

function itemRow(
  id: string,
  name: string,
  placement: ItemRowModel['placement'],
  overrides: Partial<ItemRowModel> = {}
): ItemRowModel {
  return {
    id,
    name,
    typeId: null,
    typeName: null,
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement,
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-27T00:00:00.000Z',
    ...overrides,
  };
}

function fixtureRow(overrides: Partial<FixtureListRow> = {}): FixtureListRow {
  return {
    id: 'outlet',
    name: 'Bedside outlet',
    type: 'power',
    locationId: 'bedroom',
    notes: 'behind the table',
    createdAt: '2026-09-27T00:00:00.000Z',
    lastEditedTime: '2026-09-27T00:00:00.000Z',
    ...overrides,
  };
}

describe('optionsWorld', () => {
  it('optionsWorld keeps the placement items and adds each option row it lacks once', () => {
    const existing = itemRow('existing', 'Existing item', { kind: 'location', locationId: 'home' });
    const candidate = itemRow('candidate', 'Candidate item', {
      kind: 'location',
      locationId: 'bedroom',
    });
    const placement = buildWorld([existing], [home]);

    const world = optionsWorld(placement, [existing, candidate, candidate], [home, bedroom]);

    expect(world.items.get('existing')).toBe(existing);
    expect(world.items.get('candidate')).toBe(candidate);
    expect([...world.items.keys()]).toEqual(['existing', 'candidate']);
    expect(world.locations.get('bedroom')).toBe(bedroom);
  });
});

describe('itemOptions', () => {
  it("an option row inside a container of the placement world gets that container's room", () => {
    const container = itemRow(
      'box',
      'Storage box',
      { kind: 'location', locationId: 'home' },
      {
        container: { access: 'open', full: false },
      }
    );
    const inactive = itemRow(
      'retired',
      'Retired lamp',
      { kind: 'container', containerId: 'box' },
      {
        lifecycle: 'retired',
      }
    );
    const world = buildWorld([container, inactive], [home, bedroom]);

    const options = itemOptions([container, inactive], world, (item) =>
      item.lifecycle === 'active' ? undefined : `${item.name} is ${item.lifecycle}.`
    );

    expect(options).toHaveLength(1);
    const option = options[0];
    if (option === undefined) throw new Error('Expected an item option');
    expect(option.title).toBe('Retired lamp');
    expect(option.refusal).toBe('Retired lamp is retired.');
    expect(renderToStaticMarkup(createElement(Fragment, null, option.meta))).toContain('Home');
  });
});

describe('fixtureOptions', () => {
  it('shows the fixture kind and omits an absent place', () => {
    const options = fixtureOptions(
      [fixtureRow(), fixtureRow({ id: 'loose', name: 'Loose power', locationId: null })],
      [bedroom],
      () => undefined
    );

    const placed = options.find((option) => option.key === 'fixture:outlet');
    const loose = options.find((option) => option.key === 'fixture:loose');
    if (placed === undefined || loose === undefined) throw new Error('Expected fixture options');

    expect(renderToStaticMarkup(createElement(Fragment, null, placed.meta))).toContain(
      'Power outlet, Bedroom'
    );
    expect(renderToStaticMarkup(createElement(Fragment, null, loose.meta))).toContain(
      '<span class="truncate">Power outlet</span>'
    );
  });
});
