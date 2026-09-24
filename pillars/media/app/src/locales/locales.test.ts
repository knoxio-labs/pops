import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';

import { localeCatalogueProblems } from '@pops/pillar-sdk/testing';

import { i18n } from '.';

describe('media translations', () => {
  it('registers under the media namespace', () => {
    expect(i18n.namespace).toBe('media');
  });

  it('ships every supported locale with the same non-empty keys', () => {
    expect(localeCatalogueProblems(i18n.resources)).toEqual([]);
  });

  it('resolves its keys through i18next', async () => {
    const instance = createInstance();
    await instance.init({
      lng: 'en-AU',
      resources: { 'en-AU': { media: i18n.resources['en-AU'] } },
    });
    const t = instance.getFixedT('en-AU', 'media');

    expect(t('library')).toBe('Library');
    expect(t('watchlist')).toBe('Watchlist');
    expect(t('compare')).toBe('Compare Arena');
  });
});
