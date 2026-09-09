import { describe, expect, it } from 'vitest';

import { SHARED_RUNTIME_ENTRY_POINTS } from '@pops/pillar-sdk/remote-build';

import { sharedRuntimeInternals } from './vite-plugin-shared-runtime.js';

const { chunkNameFor, facadeSource, devUrlFor, buildImports, duplicatedSharedPackages } =
  sharedRuntimeInternals;

/** A bundle entry shaped like the chunk the plugin reads. */
function chunk(name: string, modules: readonly string[] = []) {
  return { name, modules: Object.fromEntries(modules.map((id) => [id, {}])) };
}

describe('chunkNameFor', () => {
  it('flattens a subpath and a scope into one segment', () => {
    expect(chunkNameFor('react')).toBe('shared-runtime-react');
    expect(chunkNameFor('react/jsx-runtime')).toBe('shared-runtime-react__jsx-runtime');
    expect(chunkNameFor('@tanstack/react-query')).toBe('shared-runtime-tanstack__react-query');
  });

  it('gives every entry point a distinct chunk name', () => {
    const names = SHARED_RUNTIME_ENTRY_POINTS.map((entry) => chunkNameFor(entry.specifier));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('facadeSource', () => {
  // The defect this function was written around: `export *` over a CommonJS
  // package forwards nothing, so a facade built that way hands a pillar a
  // namespace with only `default` on it.
  it('names a CommonJS package’s exports explicitly', async () => {
    const source = await facadeSource('react', true);
    expect(source).toContain("from 'react'");
    expect(source).toMatch(/export \{[^}]*\buseState\b/);
    expect(source).toMatch(/export \{[^}]*\buseEffect\b/);
    expect(source).toContain("export { default } from 'react';");
  });

  // A specifier the host cannot import — `@pops/ui`'s entry is TypeScript
  // source, which `vite build`'s Node config loader will not take — falls back
  // to `export *`. That is correct for it and only for it: the fallback works
  // because the package is ESM the whole way down. This runner CAN import it,
  // so the fallback is exercised through a specifier nothing resolves.
  it('falls back to a star re-export when the specifier cannot be imported', async () => {
    expect(await facadeSource('@pops/nonexistent-for-this-test', false)).toBe(
      "export * from '@pops/nonexistent-for-this-test';\n"
    );
  });

  it('adds a default to the fallback form only when one is declared', async () => {
    const withDefault = await facadeSource('@pops/nonexistent-for-this-test', true);
    expect(withDefault).toContain("export { default } from '@pops/nonexistent-for-this-test';");
  });

  it('omits a default the module does not export', async () => {
    const source = await facadeSource('react-router', false);
    expect(source).not.toContain('export { default }');
  });

  // The contract, stated once over every specifier rather than sampled: a name
  // missing from a facade is a named import that resolves to `undefined` in a
  // pillar, which no build reports.
  it.each(SHARED_RUNTIME_ENTRY_POINTS)(
    'carries every export of $specifier',
    async ({ specifier, hasDefault }) => {
      const source = await facadeSource(specifier, hasDefault);
      const namespace: Record<string, unknown> = await import(specifier);
      for (const name of Object.keys(namespace)) {
        if (name === 'default') continue;
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
        expect(source, `${specifier} → ${name}`).toMatch(
          new RegExp(`\\b${name}\\b|export \\* from`)
        );
      }
    }
  );
});

describe('devUrlFor', () => {
  it('escapes the resolved id the way the dev server serves it', () => {
    expect(devUrlFor('react')).toBe('/@id/__x00__virtual:pops-shared-runtime/react');
    expect(devUrlFor('@tanstack/react-query')).toBe(
      '/@id/__x00__virtual:pops-shared-runtime/@tanstack/react-query'
    );
  });
});

describe('buildImports', () => {
  function completeBundle(): Record<string, unknown> {
    return Object.fromEntries(
      SHARED_RUNTIME_ENTRY_POINTS.map(({ specifier }, index) => [
        `assets/${chunkNameFor(specifier)}-hash${index}.js`,
        chunk(chunkNameFor(specifier)),
      ])
    );
  }

  it('maps every specifier to the file the build emitted for it', () => {
    const imports = buildImports(completeBundle());
    expect(Object.keys(imports).toSorted()).toEqual(
      SHARED_RUNTIME_ENTRY_POINTS.map((entry) => entry.specifier).toSorted()
    );
    expect(imports['react']).toMatch(/^\/assets\/shared-runtime-react-hash\d+\.js$/);
  });

  // A map short one specifier is a pillar that loads and then fails at the
  // first component reaching for it, in a browser. It has to fail here.
  it('throws when an entry was not emitted', () => {
    const bundle = completeBundle();
    delete bundle[
      Object.keys(bundle).find((file) => file.includes('shared-runtime-react-hash')) ?? ''
    ];
    expect(() => buildImports(bundle)).toThrow(/shared-runtime entry for 'react'/);
  });
});

describe('duplicatedSharedPackages', () => {
  const packageNameOf = (id: string): string | undefined => {
    if (id.startsWith('/react/')) return 'react';
    if (id.startsWith('/ui/')) return '@pops/ui';
    return undefined;
  };

  it('accepts a package whose modules are distributed across chunks', () => {
    const bundle = {
      'a.js': chunk('a', ['/react/index.js']),
      'b.js': chunk('b', ['/react/jsx-runtime.js']),
    };
    expect(duplicatedSharedPackages(bundle, packageNameOf)).toEqual([]);
  });

  it('reports a module emitted into two chunks', () => {
    const bundle = {
      'a.js': chunk('a', ['/react/index.js']),
      'b.js': chunk('b', ['/react/index.js']),
    };
    expect(duplicatedSharedPackages(bundle, packageNameOf)).toEqual(['react']);
  });

  it('reports each duplicated package once, sorted', () => {
    const bundle = {
      'a.js': chunk('a', ['/react/index.js', '/ui/button.js']),
      'b.js': chunk('b', ['/react/index.js', '/ui/button.js']),
      'c.js': chunk('c', ['/react/index.js']),
    };
    expect(duplicatedSharedPackages(bundle, packageNameOf)).toEqual(['@pops/ui', 'react']);
  });

  it('ignores a duplicated module that belongs to no shared package', () => {
    const bundle = {
      'a.js': chunk('a', ['/other/thing.js']),
      'b.js': chunk('b', ['/other/thing.js']),
    };
    expect(duplicatedSharedPackages(bundle, packageNameOf)).toEqual([]);
  });
});

/**
 * The flags live in `@pops/pillar-sdk/remote-build`, which depends on none of
 * these packages and so cannot check them. The shell depends on all of them,
 * and it is the package whose build breaks when a flag is wrong:
 * `export { default } from 'react-router'` is a build error, not a no-op.
 */
describe('SHARED_RUNTIME_ENTRY_POINTS default-export flags', () => {
  it.each(SHARED_RUNTIME_ENTRY_POINTS)(
    'records the default export of $specifier correctly',
    async ({ specifier, hasDefault }) => {
      const namespace: Record<string, unknown> = await import(specifier);
      expect(Object.hasOwn(namespace, 'default'), specifier).toBe(hasDefault);
    }
  );
});
