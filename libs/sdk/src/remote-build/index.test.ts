import { describe, expect, it } from 'vitest';

import {
  findBundledSharedRuntime,
  isSharedRuntimeSpecifier,
  SHARED_RUNTIME_SPECIFIERS,
} from './index.js';

const VIRTUAL_STORE = '/repo/node_modules/.pnpm';

/** A pnpm-virtual-store module id, the shape a real Rollup build reports. */
function installed(pkg: string, version: string, file: string): string {
  return `${VIRTUAL_STORE}/${pkg.replace('/', '+')}@${version}/node_modules/${pkg}/${file}`;
}

describe('isSharedRuntimeSpecifier', () => {
  it('matches every declared package by its exact name', () => {
    for (const shared of SHARED_RUNTIME_SPECIFIERS) {
      expect(isSharedRuntimeSpecifier(shared)).toBe(true);
    }
  });

  it('matches subpaths of a shared package', () => {
    expect(isSharedRuntimeSpecifier('react/jsx-runtime')).toBe(true);
    expect(isSharedRuntimeSpecifier('react-dom/client')).toBe(true);
    expect(isSharedRuntimeSpecifier('@pops/ui/theme')).toBe(true);
  });

  // A prefix match without the boundary would externalise these, and the
  // shell's import map has no entry for them — the pillar would fail to load
  // outright rather than ship a harmless duplicate.
  it('does not match a package that merely starts with a shared name', () => {
    expect(isSharedRuntimeSpecifier('react-router-dom')).toBe(false);
    expect(isSharedRuntimeSpecifier('react-domain')).toBe(false);
    expect(isSharedRuntimeSpecifier('@pops/ui-kit')).toBe(false);
    expect(isSharedRuntimeSpecifier('i18next-browser-languagedetector')).toBe(false);
  });

  it('does not match first-party or unrelated packages', () => {
    expect(isSharedRuntimeSpecifier('@pops/navigation')).toBe(false);
    expect(isSharedRuntimeSpecifier('@pops/types')).toBe(false);
    expect(isSharedRuntimeSpecifier('clsx')).toBe(false);
    expect(isSharedRuntimeSpecifier('./routes')).toBe(false);
  });
});

describe('findBundledSharedRuntime', () => {
  it('reports nothing for a bundle of first-party sources only', () => {
    expect(
      findBundledSharedRuntime([
        '/repo/pillars/purchases/app/src/bundles.ts',
        '/repo/pillars/purchases/app/src/pages/MerchantLensPage.tsx',
      ])
    ).toEqual([]);
  });

  it('names a shared package pulled in through the pnpm virtual store', () => {
    expect(
      findBundledSharedRuntime([
        '/repo/pillars/purchases/app/src/bundles.ts',
        installed('react', '19.2.8', 'index.js'),
      ])
    ).toEqual(['react']);
  });

  it('resolves a scoped package to its full name', () => {
    expect(
      findBundledSharedRuntime([installed('@tanstack/react-query', '5.101.4', 'build/index.js')])
    ).toEqual(['@tanstack/react-query']);
  });

  it('reports each offender once and in a stable order', () => {
    const offenders = findBundledSharedRuntime([
      installed('react-dom', '19.2.8', 'client.js'),
      installed('react', '19.2.8', 'index.js'),
      installed('react', '19.2.8', 'jsx-runtime.js'),
    ]);
    expect(offenders).toEqual(['react', 'react-dom']);
  });

  // A duplicate copy hoisted beside the consumer rather than in the virtual
  // store is the same defect and must not read as clean because the path
  // shape differs.
  it('catches a nested copy under a consuming package', () => {
    expect(
      findBundledSharedRuntime(['/repo/node_modules/some-widget/node_modules/react/index.js'])
    ).toEqual(['react']);
  });

  it('leaves a bundled non-shared dependency alone', () => {
    expect(findBundledSharedRuntime([installed('clsx', '2.1.1', 'dist/clsx.mjs')])).toEqual([]);
  });

  // `.pnpm` is a store directory, not a package. Reading the first
  // `node_modules/` rather than the last would report it as one.
  it('does not mistake the virtual-store directory for a package', () => {
    expect(findBundledSharedRuntime([`${VIRTUAL_STORE}/`])).toEqual([]);
  });
});
