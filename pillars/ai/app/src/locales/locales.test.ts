import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';

import { localeCatalogueProblems } from '@pops/pillar-sdk/testing';

import { i18n } from '.';

describe('ai translations', () => {
  it('registers under the ai namespace', () => {
    expect(i18n.namespace).toBe('ai');
  });

  it('ships every supported locale with the same non-empty keys', () => {
    expect(localeCatalogueProblems(i18n.resources)).toEqual([]);
  });

  it('resolves its keys through i18next', async () => {
    const instance = createInstance();
    await instance.init({ lng: 'en-AU', resources: { 'en-AU': { ai: i18n.resources['en-AU'] } } });
    const t = instance.getFixedT('en-AU', 'ai');

    expect(t('observability')).toBe('AI Observability');
    expect(t('kpi.cacheHitRate')).toBe('Cache Hit Rate');
  });
});
