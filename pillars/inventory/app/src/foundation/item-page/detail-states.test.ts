import { describe, expect, it } from 'vitest';

import { detailViewState } from './detail-states';

describe('item detail view states', () => {
  it('prioritizes a missing route id and a not-found response', () => {
    expect(
      detailViewState({
        hasId: false,
        isLoading: false,
        hasItem: false,
        isNotFound: false,
        hasError: false,
      })
    ).toBe('not-found');
    expect(
      detailViewState({
        hasId: true,
        isLoading: false,
        hasItem: false,
        isNotFound: true,
        hasError: true,
      })
    ).toBe('not-found');
  });

  it('keeps the loading state until the first item is available', () => {
    expect(
      detailViewState({
        hasId: true,
        isLoading: true,
        hasItem: false,
        isNotFound: false,
        hasError: false,
      })
    ).toBe('loading');
  });

  it('distinguishes request failure from a ready item', () => {
    expect(
      detailViewState({
        hasId: true,
        isLoading: false,
        hasItem: false,
        isNotFound: false,
        hasError: true,
      })
    ).toBe('error');
    expect(
      detailViewState({
        hasId: true,
        isLoading: false,
        hasItem: true,
        isNotFound: false,
        hasError: false,
      })
    ).toBe('ready');
  });
});
