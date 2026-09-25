import { describe, expect, it } from 'vitest';

import { detailKeyFor } from './use-detail-keys';

describe('detailKeyFor', () => {
  it('maps the item page keys to their registry ids', () => {
    expect(detailKeyFor({ key: 'p' })).toBe('detail-place');
    expect(detailKeyFor({ key: 'm' })).toBe('detail-move');
    expect(detailKeyFor({ key: 'o' })).toBe('detail-open-close');
    expect(detailKeyFor({ key: '1' })).toBe('detail-tab-1');
  });

  it('ignores the same letters with a modifier, and keys the page does not use', () => {
    expect(detailKeyFor({ key: 'p', metaKey: true })).toBeNull();
    expect(detailKeyFor({ key: 'c', ctrlKey: true })).toBeNull();
    expect(detailKeyFor({ key: 'q' })).toBeNull();
  });

  it('never answers with a binding from another scope', () => {
    expect(detailKeyFor({ key: 'x' })).toBeNull();
    expect(detailKeyFor({ key: 't' })).toBeNull();
  });
});
