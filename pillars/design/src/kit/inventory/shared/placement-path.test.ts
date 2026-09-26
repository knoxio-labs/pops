import { describe, expect, it } from 'vitest';

import { visibleSegments } from './placement-path';

import type { PathSegment } from './placement-model';

const loc = (id: string): PathSegment => ({ kind: 'location', id, name: id });
const box = (id: string): PathSegment => ({ kind: 'container', id, name: id });
const isProperty = (id: string): boolean => id === 'house';
const names = (segments: PathSegment[]): string[] => segments.map((segment) => segment.name);

describe('visibleSegments', () => {
  it('implies the house once something follows it', () => {
    expect(names(visibleSegments([loc('house'), loc('kitchen')], 3, isProperty))).toEqual([
      'kitchen',
    ]);
  });

  it('keeps a lone property, and a non-property root', () => {
    expect(names(visibleSegments([loc('house')], 3, isProperty))).toEqual(['house']);
    expect(names(visibleSegments([loc('storage'), loc('bay')], 3, isProperty))).toEqual([
      'storage',
      'bay',
    ]);
  });

  it('folds after the first segment and keeps the nearest ones', () => {
    const trail = [loc('house'), loc('garage'), loc('shelving'), box('tub'), box('case')];
    expect(names(visibleSegments(trail, 3, isProperty))).toEqual(['garage', '…', 'tub', 'case']);
    expect(names(visibleSegments(trail, 2, isProperty))).toEqual(['garage', '…', 'case']);
  });

  it('never folds below two segments, and leaves a short path alone', () => {
    const trail = [loc('garage'), loc('shelving'), box('tub')];
    expect(names(visibleSegments(trail, 1, isProperty))).toEqual(['garage', '…', 'tub']);
    expect(names(visibleSegments(trail, 3, isProperty))).toEqual(['garage', 'shelving', 'tub']);
  });
});
