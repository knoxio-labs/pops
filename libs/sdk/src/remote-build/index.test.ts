import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createPackageNameResolver,
  SHARED_RUNTIME_ENTRY_POINTS,
  type ManifestFiles,
  findBundledSharedRuntime,
  isSharedRuntimeSpecifier,
  SHARED_RUNTIME_SPECIFIERS,
  type PackageNameResolver,
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

/**
 * Stands in for the filesystem walk: a module id is attributed to the
 * longest declared package directory that contains it, which is what
 * "nearest package.json" means.
 */
function resolverFor(packageDirectories: Record<string, string>): PackageNameResolver {
  const entries = Object.entries(packageDirectories).toSorted(([a], [b]) => b.length - a.length);
  return (moduleId) => entries.find(([directory]) => moduleId.startsWith(`${directory}/`))?.[1];
}

const RESOLVER = resolverFor({
  [`${VIRTUAL_STORE}/react@19.2.8/node_modules/react`]: 'react',
  [`${VIRTUAL_STORE}/react-dom@19.2.8/node_modules/react-dom`]: 'react-dom',
  [`${VIRTUAL_STORE}/@tanstack+react-query@5.101.4/node_modules/@tanstack/react-query`]:
    '@tanstack/react-query',
  [`${VIRTUAL_STORE}/clsx@2.1.1/node_modules/clsx`]: 'clsx',
  '/repo/node_modules/some-widget/node_modules/react': 'react',
  '/repo/libs/ui': '@pops/ui',
  '/repo/libs/navigation': '@pops/navigation',
  '/repo/pillars/purchases/app': '@pops/app-purchases',
});

describe('findBundledSharedRuntime', () => {
  it('reports nothing for a bundle of first-party sources only', () => {
    expect(
      findBundledSharedRuntime(
        [
          '/repo/pillars/purchases/app/src/bundles.ts',
          '/repo/pillars/purchases/app/src/pages/MerchantLensPage.tsx',
        ],
        RESOLVER
      )
    ).toEqual([]);
  });

  it('names a shared package pulled in through the pnpm virtual store', () => {
    expect(
      findBundledSharedRuntime(
        ['/repo/pillars/purchases/app/src/bundles.ts', installed('react', '19.2.8', 'index.js')],
        RESOLVER
      )
    ).toEqual(['react']);
  });

  it('resolves a scoped package to its full name', () => {
    expect(
      findBundledSharedRuntime(
        [installed('@tanstack/react-query', '5.101.4', 'build/index.js')],
        RESOLVER
      )
    ).toEqual(['@tanstack/react-query']);
  });

  // The defect this function was rewritten for. `@pops/ui` is linked from the
  // workspace and its `main` points at source, so a bundled copy leaves module
  // ids with no `node_modules` segment anywhere — the path-segment check this
  // replaced reported a clean bundle for the one listed package a repo-local
  // build is most likely to inline.
  it('catches a workspace package bundled from its own source tree', () => {
    expect(
      findBundledSharedRuntime(
        ['/repo/pillars/purchases/app/src/bundles.ts', '/repo/libs/ui/src/components/button.tsx'],
        RESOLVER
      )
    ).toEqual(['@pops/ui']);
  });

  it('leaves a bundled workspace package that is not shared alone', () => {
    expect(findBundledSharedRuntime(['/repo/libs/navigation/src/icon-map.ts'], RESOLVER)).toEqual(
      []
    );
  });

  it('reports each offender once and in a stable order', () => {
    const offenders = findBundledSharedRuntime(
      [
        installed('react-dom', '19.2.8', 'client.js'),
        installed('react', '19.2.8', 'index.js'),
        installed('react', '19.2.8', 'jsx-runtime.js'),
        '/repo/libs/ui/src/index.ts',
      ],
      RESOLVER
    );
    expect(offenders).toEqual(['@pops/ui', 'react', 'react-dom']);
  });

  // A duplicate copy hoisted beside the consumer rather than in the virtual
  // store is the same defect and must not read as clean because the path
  // shape differs.
  it('catches a nested copy under a consuming package', () => {
    expect(
      findBundledSharedRuntime(
        ['/repo/node_modules/some-widget/node_modules/react/index.js'],
        RESOLVER
      )
    ).toEqual(['react']);
  });

  it('leaves a bundled non-shared dependency alone', () => {
    expect(
      findBundledSharedRuntime([installed('clsx', '2.1.1', 'dist/clsx.mjs')], RESOLVER)
    ).toEqual([]);
  });

  it('ignores an id the resolver attributes to no package', () => {
    expect(findBundledSharedRuntime(['\0virtual:some-plugin', 'not/absolute'], RESOLVER)).toEqual(
      []
    );
  });
});

describe('createPackageNameResolver', () => {
  const resolve = createPackageNameResolver();
  const here = fileURLToPath(new URL('.', import.meta.url));

  it('attributes a workspace source file to its package', () => {
    expect(resolve(join(here, 'index.ts'))).toBe('@pops/pillar-sdk');
  });

  it('attributes an installed file to the package that declares it', () => {
    expect(resolve(fileURLToPath(import.meta.resolve('react')))).toBe('react');
  });

  it('attributes a scoped installed file to its full name', () => {
    expect(resolve(fileURLToPath(import.meta.resolve('@pops/types')))).toBe('@pops/types');
  });

  it('ignores a rollup virtual id and a relative id', () => {
    expect(resolve('\0virtual:x')).toBeUndefined();
    expect(resolve('./relative.ts')).toBeUndefined();
  });

  it('strips a query suffix before walking', () => {
    expect(resolve(`${join(here, 'index.ts')}?commonjs-proxy`)).toBe('@pops/pillar-sdk');
  });
});

/**
 * A synthetic tree, so the walk's termination can be driven over layouts the
 * real filesystem will not hold still for.
 */
function filesystem(manifests: Record<string, string>): ManifestFiles {
  return {
    exists: (path) => Object.hasOwn(manifests, path),
    read: (path) => manifests[path] ?? '',
  };
}

describe('createPackageNameResolver — walking to the nearest manifest', () => {
  it('stops at the first named manifest above the file', () => {
    const resolve = createPackageNameResolver(
      filesystem({
        '/repo/package.json': JSON.stringify({ name: 'root' }),
        '/repo/libs/ui/package.json': JSON.stringify({ name: '@pops/ui' }),
      })
    );
    expect(resolve('/repo/libs/ui/src/components/button.tsx')).toBe('@pops/ui');
  });

  it('climbs past a nameless manifest to the package that owns it', () => {
    const resolve = createPackageNameResolver(
      filesystem({
        '/repo/libs/ui/package.json': JSON.stringify({ name: '@pops/ui' }),
        '/repo/libs/ui/dist/package.json': JSON.stringify({ type: 'module' }),
      })
    );
    expect(resolve('/repo/libs/ui/dist/index.js')).toBe('@pops/ui');
  });

  // Both ways of reaching the root have to stop there. The nameless-manifest
  // branch used to recurse into itself instead, which is a stack overflow
  // rather than an unresolved id.
  it('terminates at the root when nothing above the file is named', () => {
    const resolve = createPackageNameResolver(filesystem({}));
    expect(resolve('/deeply/nested/file.js')).toBeUndefined();
  });

  it('terminates at the root when the root manifest itself is nameless', () => {
    const resolve = createPackageNameResolver(
      filesystem({ '/package.json': JSON.stringify({ type: 'module' }) })
    );
    expect(resolve('/file.js')).toBeUndefined();
    expect(resolve('/deeply/nested/file.js')).toBeUndefined();
  });

  it('reads each directory once across repeated lookups', () => {
    const reads: string[] = [];
    const manifests = { '/repo/libs/ui/package.json': JSON.stringify({ name: '@pops/ui' }) };
    const resolve = createPackageNameResolver({
      exists: (path) => {
        reads.push(path);
        return Object.hasOwn(manifests, path);
      },
      read: (path) => manifests[path as keyof typeof manifests] ?? '',
    });

    resolve('/repo/libs/ui/src/a.ts');
    const afterFirst = reads.length;
    resolve('/repo/libs/ui/src/b.ts');

    expect(reads.length).toBe(afterFirst);
  });
});

/**
 * The two lists describe one contract from opposite ends: what a remote bundle
 * must not contain, and what the host must be able to hand it. A specifier
 * missing from either side fails only in a browser — as a duplicated package,
 * or as a bare import nothing resolves.
 *
 * The `hasDefault` flags are checked against the real modules by
 * `pillars/shell`, which depends on all of them; this package depends on none.
 */
describe('SHARED_RUNTIME_ENTRY_POINTS', () => {
  it('names only specifiers the external predicate keeps out of a bundle', () => {
    for (const { specifier } of SHARED_RUNTIME_ENTRY_POINTS) {
      expect(isSharedRuntimeSpecifier(specifier), specifier).toBe(true);
    }
  });

  it('covers every shared package at its root', () => {
    const roots = new Set(SHARED_RUNTIME_ENTRY_POINTS.map((entry) => entry.specifier));
    for (const shared of SHARED_RUNTIME_SPECIFIERS) {
      expect(roots.has(shared), shared).toBe(true);
    }
  });

  it('lists each specifier once', () => {
    const specifiers = SHARED_RUNTIME_ENTRY_POINTS.map((entry) => entry.specifier);
    expect(new Set(specifiers).size).toBe(specifiers.length);
  });
});
