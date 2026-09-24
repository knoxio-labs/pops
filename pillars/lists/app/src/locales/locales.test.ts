import { describe, expect, it } from 'vitest';

import { localeCatalogueProblems } from '@pops/pillar-sdk/testing';

import { i18n } from '.';

describe('lists translations', () => {
  it('registers under the lists namespace', () => {
    expect(i18n.namespace).toBe('lists');
  });

  it('ships every supported locale with the same non-empty keys', () => {
    expect(localeCatalogueProblems(i18n.resources)).toEqual([]);
  });
});
