import { describe, expect, it } from 'vitest';

import {
  placementForCreate,
  placementForUpdate,
  type PlacementColumns,
} from '../legacy-placement.js';

const NO_PREVIOUS = {
  previousPlacementKind: null,
  previousLocationId: null,
  previousContainingItemId: null,
} as const;

const AT_SHELF: PlacementColumns = {
  placementKind: 'location',
  locationId: 'shelf',
  containingItemId: null,
  ...NO_PREVIOUS,
};

const IN_BOX: PlacementColumns = {
  placementKind: 'container',
  locationId: null,
  containingItemId: 'box',
  ...NO_PREVIOUS,
};

const IN_HAND_FROM_SHELF: PlacementColumns = {
  placementKind: 'hand',
  locationId: null,
  containingItemId: null,
  previousPlacementKind: 'location',
  previousLocationId: 'shelf',
  previousContainingItemId: null,
};

describe('placementForCreate', () => {
  it('puts the item in the named container, ignoring a location sent alongside it', () => {
    expect(placementForCreate({ containerId: 'box', locationId: 'shelf' })).toEqual(IN_BOX);
  });

  it('puts the item at the named location when no container is named', () => {
    expect(placementForCreate({ locationId: 'shelf', containerId: null })).toEqual(AT_SHELF);
  });

  it('puts the item in hand with nothing remembered when neither is named', () => {
    const inHand = {
      placementKind: 'hand',
      locationId: null,
      containingItemId: null,
      ...NO_PREVIOUS,
    };
    expect(placementForCreate({})).toEqual(inHand);
    expect(placementForCreate({ locationId: null, containerId: null })).toEqual(inHand);
  });
});

describe('placementForUpdate', () => {
  it('leaves placement alone when neither field is sent', () => {
    expect(placementForUpdate(AT_SHELF, {})).toBeNull();
    expect(placementForUpdate(IN_BOX, {})).toBeNull();
  });

  it('moves into a named container from anywhere, dropping any remembered place', () => {
    expect(placementForUpdate(AT_SHELF, { containerId: 'box' })).toEqual(IN_BOX);
    expect(placementForUpdate(IN_HAND_FROM_SHELF, { containerId: 'box' })).toEqual(IN_BOX);
  });

  it('moves to a named location, which takes the item out of its container', () => {
    expect(placementForUpdate(IN_BOX, { locationId: 'shelf' })).toEqual(AT_SHELF);
  });

  it('clearing the location that holds the item puts it in hand remembering the location', () => {
    expect(placementForUpdate(AT_SHELF, { locationId: null })).toEqual(IN_HAND_FROM_SHELF);
  });

  it('clearing the container that holds the item puts it in hand remembering the container', () => {
    expect(placementForUpdate(IN_BOX, { containerId: null })).toEqual({
      placementKind: 'hand',
      locationId: null,
      containingItemId: null,
      previousPlacementKind: 'container',
      previousLocationId: null,
      previousContainingItemId: 'box',
    });
  });

  it('clearing a reference that does not hold the item changes nothing', () => {
    expect(placementForUpdate(IN_BOX, { locationId: null })).toBeNull();
    expect(placementForUpdate(AT_SHELF, { containerId: null })).toBeNull();
    expect(placementForUpdate(IN_HAND_FROM_SHELF, { locationId: null })).toBeNull();
  });

  it('clearing both while contained leaves the item in hand remembering the container', () => {
    expect(placementForUpdate(IN_BOX, { containerId: null, locationId: null })).toMatchObject({
      placementKind: 'hand',
      previousPlacementKind: 'container',
      previousContainingItemId: 'box',
    });
  });
});
