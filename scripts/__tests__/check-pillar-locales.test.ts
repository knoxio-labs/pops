import { describe, expect, it } from 'vitest';

import {
  evaluateLocaleParity,
  referencesLocaleCatalogueProblems,
} from '../check-pillar-locales.mjs';

type PillarApp = Parameters<typeof evaluateLocaleParity>[0][number];

const app = (pkgName: string): PillarApp => {
  const pillarId = pkgName.replace('@pops/app-', '');
  return { pkgName, pkgPath: `pillars/${pillarId}/app/package.json`, pillarId };
};

/** A pillar with no `src/locales/` directory at all. */
const noLocalesDir = () => ({ hasLocalesDir: false });

/** A pillar whose `src/locales/` carries every required file. */
const complete = () => ({
  hasLocalesDir: true,
  enAU: true,
  ptBR: true,
  indexTs: true,
  testFile: true,
  testReferencesHelper: true,
});

describe('evaluateLocaleParity', () => {
  it('passes when every discovered app with locales is complete', () => {
    const apps = [app('@pops/app-alpha'), app('@pops/app-beta')];
    const result = evaluateLocaleParity(apps, complete);
    expect(result.missing).toEqual([]);
    expect(result.covered).toEqual(['@pops/app-alpha', '@pops/app-beta']);
    expect(result.skipped).toEqual([]);
  });

  it('skips, rather than flags, an app with no src/locales/ directory', () => {
    const apps = [app('@pops/app-alpha'), app('@pops/app-beta')];
    const result = evaluateLocaleParity(apps, noLocalesDir);
    expect(result.missing).toEqual([]);
    expect(result.covered).toEqual([]);
    expect(result.skipped).toEqual(['@pops/app-alpha', '@pops/app-beta']);
  });

  it('reports the exact app whose src/locales/ is incomplete', () => {
    const apps = [app('@pops/app-alpha'), app('@pops/app-beta')];
    const result = evaluateLocaleParity(apps, (candidate) =>
      candidate.pkgName === '@pops/app-alpha' ? complete() : { ...complete(), ptBR: false }
    );
    expect(result.missing).toEqual(['@pops/app-beta']);
    expect(result.covered).toEqual(['@pops/app-alpha']);
  });

  it('reports multiple apps with an incomplete src/locales/', () => {
    const apps = [app('@pops/app-a'), app('@pops/app-b'), app('@pops/app-c')];
    const result = evaluateLocaleParity(apps, (candidate) =>
      candidate.pkgName === '@pops/app-b' ? complete() : { ...complete(), enAU: false }
    );
    expect(result.missing).toEqual(['@pops/app-a', '@pops/app-c']);
  });

  it('flags a missing pt-BR.json', () => {
    const apps = [app('@pops/app-beta')];
    const result = evaluateLocaleParity(apps, () => ({ ...complete(), ptBR: false }));
    expect(result.missing).toEqual(['@pops/app-beta']);
    expect(result.reasons[0]).toContain('src/locales/pt-BR.json');
  });

  it('flags a missing en-AU.json', () => {
    const apps = [app('@pops/app-beta')];
    const result = evaluateLocaleParity(apps, () => ({ ...complete(), enAU: false }));
    expect(result.missing).toEqual(['@pops/app-beta']);
    expect(result.reasons[0]).toContain('src/locales/en-AU.json');
  });

  it('flags a missing index.ts', () => {
    const apps = [app('@pops/app-beta')];
    const result = evaluateLocaleParity(apps, () => ({ ...complete(), indexTs: false }));
    expect(result.missing).toEqual(['@pops/app-beta']);
    expect(result.reasons[0]).toContain('src/locales/index.ts');
  });

  // A missing test file and a test file that never calls the parity helper are
  // different failures with different fixes, so they must read differently.
  it('flags a missing locales.test.ts, distinct from one that does not call the helper', () => {
    const apps = [app('@pops/app-beta')];
    const result = evaluateLocaleParity(apps, () => ({
      ...complete(),
      testFile: false,
      testReferencesHelper: false,
    }));
    expect(result.missing).toEqual(['@pops/app-beta']);
    expect(result.reasons[0]).toContain('src/locales/locales.test.ts');
    expect(result.reasons[0]).not.toContain('calls localeCatalogueProblems');
  });

  it('flags a locales.test.ts that exists but never calls localeCatalogueProblems', () => {
    const apps = [app('@pops/app-beta')];
    const result = evaluateLocaleParity(apps, () => ({
      ...complete(),
      testReferencesHelper: false,
    }));
    expect(result.missing).toEqual(['@pops/app-beta']);
    expect(result.reasons[0]).toContain('a locales.test.ts that calls localeCatalogueProblems');
  });

  it('reads every missing field as one sentence', () => {
    const apps = [app('@pops/app-beta')];
    const result = evaluateLocaleParity(apps, () => ({
      hasLocalesDir: true,
      enAU: false,
      ptBR: false,
      indexTs: false,
      testFile: false,
      testReferencesHelper: false,
    }));
    expect(result.reasons[0]).toContain(
      'src/locales/en-AU.json and src/locales/pt-BR.json and src/locales/index.ts and ' +
        'src/locales/locales.test.ts'
    );
  });

  it('flags every app when none is complete', () => {
    const apps = [app('@pops/app-alpha'), app('@pops/app-beta')];
    const result = evaluateLocaleParity(apps, () => ({ ...complete(), ptBR: false }));
    expect(result.missing).toEqual(['@pops/app-alpha', '@pops/app-beta']);
    expect(result.covered).toEqual([]);
  });
});

describe('referencesLocaleCatalogueProblems', () => {
  it('recognises a real call to the helper', () => {
    const src = [
      "import { localeCatalogueProblems } from '@pops/pillar-sdk/testing';",
      "it('ships parity', () => {",
      '  expect(localeCatalogueProblems(i18n.resources)).toEqual([]);',
      '});',
    ].join('\n');
    expect(referencesLocaleCatalogueProblems(src)).toBe(true);
  });

  it('does not count importing the helper without calling it', () => {
    const src = [
      "import { localeCatalogueProblems } from '@pops/pillar-sdk/testing';",
      "it('does nothing with it', () => {",
      '  expect(true).toBe(true);',
      '});',
    ].join('\n');
    expect(referencesLocaleCatalogueProblems(src)).toBe(false);
  });

  it('does not count a mention in a comment', () => {
    const src = [
      '/** Should call localeCatalogueProblems( to prove parity, but this one forgot. */',
      "it('does nothing', () => {",
      '  expect(true).toBe(true);',
      '});',
    ].join('\n');
    expect(referencesLocaleCatalogueProblems(src)).toBe(false);
  });

  it('recognises a call whatever its indentation or surrounding whitespace', () => {
    expect(referencesLocaleCatalogueProblems('localeCatalogueProblems( i18n.resources )')).toBe(
      true
    );
  });

  it('reads nothing from an empty source', () => {
    expect(referencesLocaleCatalogueProblems('')).toBe(false);
  });
});
