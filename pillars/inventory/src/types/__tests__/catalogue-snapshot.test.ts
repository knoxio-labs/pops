import { describe, expect, it } from 'vitest';

import { INVENTORY_TYPES } from '../catalogue.js';
import {
  findIncompatibilities,
  projectCatalogue,
  type CatalogueDescriptor,
} from '../descriptor.js';
import { TYPE_MIGRATIONS } from '../type-migrations.js';
import snapshot from '../types.snapshot.json';

describe('the committed types.snapshot.json', () => {
  const current = projectCatalogue(INVENTORY_TYPES);
  const committed = snapshot as CatalogueDescriptor;

  it('carries every currently declared type', () => {
    expect(committed.types.map((type) => type.key).toSorted()).toEqual(
      current.types.map((type) => type.key).toSorted()
    );
  });

  it('has no breaking change against the current catalogue that lacks a registered migration', () => {
    expect(findIncompatibilities(committed, current, TYPE_MIGRATIONS)).toEqual([]);
  });

  it('matches the current catalogue byte for byte, including its version', () => {
    expect(committed).toEqual(current);
  });
});

describe('the six initial types', () => {
  const byKey = new Map(INVENTORY_TYPES.map((type) => [type.key, type]));

  it('gives storage_box and furniture the containment capability, and no other type', () => {
    expect(byKey.get('storage_box')?.capabilities).toEqual(['containment']);
    expect(byKey.get('furniture')?.capabilities).toEqual(['containment']);
    for (const key of ['cable', 'charger', 'bulb', 'tape']) {
      expect(byKey.get(key)?.capabilities).toEqual([]);
    }
  });

  it('highlights exactly the fields the approved design highlights', () => {
    const highlightedKeysOf = (typeKey: string) =>
      (byKey.get(typeKey)?.fields ?? [])
        .filter((field) => field.highlighted)
        .map((field) => field.key)
        .toSorted();

    expect(highlightedKeysOf('cable')).toEqual(['End A', 'End B', 'Length'].toSorted());
    expect(highlightedKeysOf('charger')).toEqual(['Ports', 'Power'].toSorted());
    expect(highlightedKeysOf('bulb')).toEqual(['Fitting', 'Protocol'].toSorted());
    expect(highlightedKeysOf('storage_box')).toEqual(['Capacity', 'Load limit'].toSorted());
    expect(highlightedKeysOf('tape')).toEqual(['Width', 'Length'].toSorted());
    expect(highlightedKeysOf('furniture')).toEqual(['Footprint', 'Material'].toSorted());
  });
});
