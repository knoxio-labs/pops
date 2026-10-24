import { describe, expect, it } from 'vitest';

import { localeCatalogueProblems } from '@pops/pillar-sdk/testing';

import { i18n } from '.';

function strings(value: unknown, prefix = ''): Map<string, string> {
  if (typeof value === 'string') return new Map([[prefix, value]]);
  if (typeof value !== 'object' || value === null)
    throw new Error('Translation values must be strings or dictionaries');
  return new Map(
    Object.entries(value).flatMap(([key, item]) => [
      ...strings(item, prefix ? `${prefix}.${key}` : key),
    ])
  );
}

describe('contacts locale catalogue', () => {
  it('registers under the contacts namespace', () => {
    expect(i18n.namespace).toBe('contacts');
  });

  it('ships every supported locale with the same non-empty keys', () => {
    expect(localeCatalogueProblems(i18n.resources)).toEqual([]);
  });

  it('keeps interpolation variables in parity between en-AU and pt-BR', () => {
    const english = strings(i18n.resources['en-AU']);
    const portuguese = strings(i18n.resources['pt-BR']);
    for (const [key, value] of english) {
      expect(
        portuguese
          .get(key)
          ?.match(/\{\{\w+\}\}/gu)
          ?.toSorted(),
        key
      ).toEqual(value.match(/\{\{\w+\}\}/gu)?.toSorted());
    }
  });
});
