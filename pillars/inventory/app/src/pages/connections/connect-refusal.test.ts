import { describe, expect, it } from 'vitest';

import { connectRefusal, connectVerdict, endFromKey } from './connect-refusal';

import type { ItemRowModel } from '../../foundation/model/model';
import type { WebConnectionRow } from '../../inventory-web/useConnectionsRegistry';

function item(id: string, name: string, lifecycle: ItemRowModel['lifecycle'] = 'active') {
  return { id, name, lifecycle };
}

function itemRow(id: string, name: string, farId: string, farName: string): WebConnectionRow {
  return {
    id: `connection-${id}-${farId}`,
    createdAt: '2026-09-27T00:00:00.000Z',
    item: {
      id,
      name,
      code: null,
      kind: 'item',
      lifecycle: 'active',
      typeKey: null,
      isContainer: false,
    },
    far: {
      id: farId,
      name: farName,
      code: null,
      kind: 'item',
      lifecycle: 'active',
      typeKey: null,
      isContainer: false,
    },
  };
}

function fixtureRow(itemId: string, fixtureId: string): WebConnectionRow {
  return {
    id: `fixture-${fixtureId}`,
    createdAt: '2026-09-27T00:00:00.000Z',
    item: {
      id: itemId,
      name: 'Bedside lamp',
      code: null,
      kind: 'item',
      lifecycle: 'active',
      typeKey: null,
      isContainer: false,
    },
    far: {
      id: fixtureId,
      name: 'Bedside outlet',
      kind: 'fixture',
      type: 'power',
      locationId: 'bedroom',
    },
  };
}

describe('connectRefusal', () => {
  it('allows a new item to item edge', () => {
    expect(
      connectRefusal(
        item('lamp', 'Bedside lamp'),
        {
          end: { kind: 'item', itemId: 'soundbar' },
          name: 'Soundbar',
          item: item('soundbar', 'Soundbar'),
        },
        []
      )
    ).toBeNull();
  });

  it('refuses an existing edge in either direction', () => {
    const existing = [itemRow('lamp', 'Bedside lamp', 'soundbar', 'Soundbar')];
    const forward = connectRefusal(
      item('lamp', 'Bedside lamp'),
      {
        end: { kind: 'item', itemId: 'soundbar' },
        name: 'Soundbar',
        item: item('soundbar', 'Soundbar'),
      },
      existing
    );
    const backward = connectRefusal(
      item('soundbar', 'Soundbar'),
      {
        end: { kind: 'item', itemId: 'lamp' },
        name: 'Bedside lamp',
        item: item('lamp', 'Bedside lamp'),
      },
      existing
    );

    expect(forward).toBe('Bedside lamp and Soundbar are already connected.');
    expect(backward).toBe('Soundbar and Bedside lamp are already connected.');
  });

  it('allows the same item to a different fixture', () => {
    expect(
      connectRefusal(
        item('lamp', 'Bedside lamp'),
        { end: { kind: 'fixture', fixtureId: 'other-outlet' }, name: 'Other outlet' },
        [fixtureRow('lamp', 'bedside-outlet')]
      )
    ).toBeNull();
  });

  it('refuses self, inactive items and unknown ends', () => {
    const television = item('tv', 'Television');
    expect(
      connectRefusal(
        television,
        { end: { kind: 'item', itemId: 'tv' }, name: 'Television', item: television },
        []
      )
    ).toBe('An item cannot connect to itself.');
    expect(
      connectRefusal(
        item('tv', 'Television', 'retired'),
        { end: { kind: 'fixture', fixtureId: 'outlet' }, name: 'Outlet' },
        []
      )
    ).toBe('Television is retired. Restore it before connecting it.');
    expect(
      connectRefusal(
        television,
        { end: { kind: 'item', itemId: 'missing' }, name: 'Missing item' },
        []
      )
    ).toBe('Choose both ends.');
    expect(connectRefusal(null, null, [])).toBe('Choose both ends.');
  });
});

describe('endFromKey', () => {
  it('reads item and fixture keys and nothing else', () => {
    expect(endFromKey('item:lamp')).toEqual({ kind: 'item', itemId: 'lamp' });
    expect(endFromKey('fixture:outlet')).toEqual({ kind: 'fixture', fixtureId: 'outlet' });
    expect(endFromKey(null)).toBeNull();
    expect(endFromKey('location:room')).toBeNull();
    expect(endFromKey('item:')).toBeNull();
    expect(endFromKey('item:lamp:extra')).toBeNull();
  });
});

describe('connectVerdict', () => {
  it('distinguishes a pending existing-connections read from a failed read', () => {
    const from = { end: { kind: 'item' as const, itemId: 'lamp' }, name: 'Lamp' };
    const to = { end: { kind: 'item' as const, itemId: 'soundbar' }, name: 'Soundbar' };

    expect(connectVerdict({ from, to, status: 'pending', refusal: null, failure: null }).text).toBe(
      'Loading existing connections…'
    );
    expect(connectVerdict({ from, to, status: 'error', refusal: null, failure: null }).text).toBe(
      'Existing connections did not load.'
    );
  });
});
