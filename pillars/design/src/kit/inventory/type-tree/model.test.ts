import { inventoryCatalogueTypes } from '@/fixtures/inventory-type-catalogue';
import { describe, expect, it } from 'vitest';

import {
  descendantIds,
  parentChoices,
  typeDepth,
  typeHeight,
  typePathLabel,
  typeTreeOptions,
} from './model';

describe('inventory type tree model', () => {
  it('keeps a child search result with its ancestor path', () => {
    expect(typePathLabel(inventoryCatalogueTypes, 'type-sheet')).toBe('Bedding › Sheet');
    expect(
      typeTreeOptions(inventoryCatalogueTypes, 'sheet', true).map((option) => option.value)
    ).toEqual(['type-bedding', 'type-sheet']);
  });

  it('computes depth, height and all descendants from parent ids', () => {
    expect(typeDepth(inventoryCatalogueTypes, 'type-pillow')).toBe(3);
    expect(typeHeight(inventoryCatalogueTypes, 'type-pillows')).toBe(2);
    expect(descendantIds(inventoryCatalogueTypes, 'type-pillows')).toEqual([
      'type-pillow',
      'type-pillowcase',
      'type-pillow-protector',
    ]);
  });

  it('explains every refusal when choosing a parent', () => {
    const choices = new Map(
      parentChoices(inventoryCatalogueTypes, 'type-pillows').map((choice) => [choice.value, choice])
    );
    expect(choices.get('type-bedding')).toMatchObject({ disabled: false });
    expect(choices.get('type-pillows')).toMatchObject({
      disabled: true,
      reason: 'A type cannot be its own parent.',
    });
    expect(choices.get('type-pillow')).toMatchObject({
      disabled: true,
      reason: 'A type cannot be parented below its descendant.',
    });
    expect(choices.get('type-pillow-protector')).toMatchObject({
      disabled: true,
      reason: 'Archived types cannot become parents.',
    });
    expect(choices.get('type-sheet')).toMatchObject({
      disabled: true,
      reason: 'Depth 4 exceeds the cap of 3.',
    });
  });
});
