import { describe, expect, it } from 'vitest';

import { reorderAdjacent, reorderOption } from './reorder';

import type { CatalogueEnumOption } from './types';

function option(id: string, archivedAt: string | null = null): CatalogueEnumOption {
  return { archivedAt, id, key: id, label: id, sortOrder: 0 };
}

describe('reorderAdjacent', () => {
  it('swaps an item with its next active sibling', () => {
    const items = [option('a'), option('b'), option('c')];
    expect(reorderAdjacent(items, 'a', 1)).toEqual(['b', 'a', 'c']);
  });

  it('swaps an item with its previous active sibling', () => {
    const items = [option('a'), option('b'), option('c')];
    expect(reorderAdjacent(items, 'c', -1)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op moving the first item up', () => {
    const items = [option('a'), option('b')];
    expect(reorderAdjacent(items, 'a', -1)).toEqual(['a', 'b']);
  });

  it('is a no-op moving the last item down', () => {
    const items = [option('a'), option('b')];
    expect(reorderAdjacent(items, 'b', 1)).toEqual(['a', 'b']);
  });

  it('skips over archived items to find the next active sibling', () => {
    const items = [option('a'), option('archived', '2026-01-01T00:00:00.000Z'), option('c')];
    expect(reorderAdjacent(items, 'a', 1)).toEqual(['c', 'archived', 'a']);
  });

  it('leaves archived items in place when moving an active item past them', () => {
    const items = [option('archived', '2026-01-01T00:00:00.000Z'), option('a'), option('b')];
    expect(reorderAdjacent(items, 'b', -1)).toEqual(['archived', 'b', 'a']);
  });
});

describe('reorderOption', () => {
  it('builds an enum_option reorder operation scoped to the field', () => {
    const items = [option('a'), option('b')];
    expect(reorderOption(items, 'a', 1, 'field-1')).toEqual({
      kind: 'reorder',
      definition: 'enum_option',
      parentId: 'field-1',
      ids: ['b', 'a'],
    });
  });
});
