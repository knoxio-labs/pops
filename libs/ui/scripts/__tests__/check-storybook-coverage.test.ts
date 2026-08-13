import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkAliasCoverage, readAliases, run } from '../check-storybook-coverage.mjs';
import {
  checkStoryCoverage,
  collectStoriedModules,
  listExportedComponentModules,
  listStoryFiles,
  readComponentExports,
  readValueImportSpecifiers,
  resolveRelativeImport,
} from '../story-coverage.mjs';

const tempRoots: string[] = [];

function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(resolve(tmpdir(), 'storybook-coverage-'));
  tempRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const target = resolve(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents, 'utf8');
  }
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('readValueImportSpecifiers', () => {
  it('collects plain, default, star and multi-line value imports', () => {
    const source = [
      "import { Badge } from './badge';",
      "import Button from './Button';",
      "export * from './Chip';",
      'import {',
      '  Table,',
      '  TableRow,',
      "} from './table';",
    ].join('\n');
    expect(readValueImportSpecifiers(source)).toEqual(['./badge', './Button', './Chip', './table']);
  });

  it('ignores type-only imports and re-exports — a prop type is not a rendered component', () => {
    const source = [
      "import type { Meta } from '@storybook/react-vite';",
      "export type { StatCardColor } from './StatCard';",
      "import { type Density, Chip } from './Chip';",
    ].join('\n');
    expect(readValueImportSpecifiers(source)).toEqual(['./Chip']);
  });
});

describe('readComponentExports', () => {
  it('finds function, arrow-const and class components, including aliased re-exports', () => {
    const source = [
      'export function PageHeader() { return null; }',
      'export const Chip = () => null;',
      'export class ErrorBoundary {}',
      "export { Button as ButtonPrimitive } from './button';",
    ].join('\n');
    expect(readComponentExports(source).toSorted()).toEqual([
      'ButtonPrimitive',
      'Chip',
      'ErrorBoundary',
      'PageHeader',
    ]);
  });

  it('ignores camelCase helpers, SCREAMING_SNAKE constants and exported types', () => {
    const source = [
      'export const UNIT_MULTIPLIERS = { s: 1 };',
      'export function formatCurrency() { return ""; }',
      'export type StatCardColor = "slate";',
      'export { type DateStyle };',
    ].join('\n');
    expect(readComponentExports(source)).toEqual([]);
  });
});

describe('resolveRelativeImport', () => {
  it('resolves extensionless specifiers to .tsx, .ts and directory index files', () => {
    const root = makeTree({
      'a.tsx': '',
      'b.ts': '',
      'c/index.ts': '',
    });
    expect(resolveRelativeImport(root, './a')).toBe(resolve(root, 'a.tsx'));
    expect(resolveRelativeImport(root, './b')).toBe(resolve(root, 'b.ts'));
    expect(resolveRelativeImport(root, './c')).toBe(resolve(root, 'c/index.ts'));
  });

  it('returns null rather than a plausible-looking path when nothing is on disk', () => {
    const root = makeTree({ 'a.tsx': '' });
    expect(resolveRelativeImport(root, './missing')).toBeNull();
  });
});

describe('checkAliasCoverage', () => {
  const pkg = { name: '@pops/app-finance', srcDir: '/repo/pillars/finance/app/src' };

  it('passes when every package has an alias resolving to its own app/src', () => {
    const root = makeTree({ 'pillars/finance/app/src/routes.tsx': '' });
    const errors = checkAliasCoverage(
      [{ name: '@pops/app-finance', srcDir: resolve(root, 'pillars/finance/app/src') }],
      [
        {
          name: '@pops/app-finance',
          replacement: resolve(root, 'pillars/finance/app/src'),
        },
      ]
    );
    expect(errors).toEqual([]);
  });

  it('reports a package with no alias at all', () => {
    const errors = checkAliasCoverage([pkg], []);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('no Vite alias');
  });

  it('reports an alias whose replacement does not exist on disk', () => {
    const errors = checkAliasCoverage([pkg], [{ name: pkg.name, replacement: '/repo/nope/src' }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('non-existent path');
  });

  it('reports an alias pointing at the wrong pillar even though that path exists', () => {
    const root = makeTree({
      'pillars/finance/app/src/routes.tsx': '',
      'pillars/media/app/src/routes.tsx': '',
    });
    const errors = checkAliasCoverage(
      [{ name: '@pops/app-finance', srcDir: resolve(root, 'pillars/finance/app/src') }],
      [{ name: '@pops/app-finance', replacement: resolve(root, 'pillars/media/app/src') }]
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('wrong pillar');
  });

  it('treats discovering zero frontend packages as a violation, not a clean run', () => {
    const errors = checkAliasCoverage([], []);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('no frontend @pops/app-* package was discovered');
  });
});

describe('listExportedComponentModules', () => {
  it('keeps only barrel-exported .tsx modules that export a component', () => {
    const root = makeTree({
      'index.ts': [
        "export * from './components/Chip';",
        "export * from './lib/format';",
        "export * from './components/tokens';",
        "export type { Density } from './components/types';",
      ].join('\n'),
      'components/Chip.tsx': 'export const Chip = () => null;',
      'components/tokens.tsx': 'export const STATUS_TONES = {};',
      'components/types.tsx': 'export type Density = "compact";',
      'lib/format.ts': 'export function formatCurrency() { return ""; }',
    });
    expect(listExportedComponentModules(root)).toEqual([resolve(root, 'components/Chip.tsx')]);
  });

  it('throws instead of reporting an empty set when the barrel is missing', () => {
    const root = makeTree({ 'components/Chip.tsx': 'export const Chip = () => null;' });
    expect(() => listExportedComponentModules(root)).toThrow(/barrel not found/);
  });
});

describe('story discovery', () => {
  it('finds stories at any depth and maps their value imports back to modules', () => {
    const root = makeTree({
      'components/Chip.tsx': 'export const Chip = () => null;',
      'components/Chip.stories.tsx': "import { Chip } from './Chip';",
      'primitives/nested/badge.tsx': 'export const Badge = () => null;',
      'primitives/nested/Badge.stories.tsx': "import { Badge } from './badge';",
      'components/Chip.test.tsx': "import { Chip } from './Chip';",
    });
    const storyFiles = listStoryFiles(root);
    expect(storyFiles.toSorted()).toEqual([
      resolve(root, 'components/Chip.stories.tsx'),
      resolve(root, 'primitives/nested/Badge.stories.tsx'),
    ]);
    expect([...collectStoriedModules(storyFiles)].toSorted()).toEqual([
      resolve(root, 'components/Chip.tsx'),
      resolve(root, 'primitives/nested/badge.tsx'),
    ]);
  });
});

describe('checkStoryCoverage', () => {
  function tree() {
    return makeTree({
      'components/Chip.tsx': 'export const Chip = () => null;',
      'components/Chip.stories.tsx': "import { Chip } from './Chip';",
      'components/Orphan.tsx': 'export const Orphan = () => null;',
    });
  }

  it('reports an exported component module no story imports', () => {
    const root = tree();
    const errors = checkStoryCoverage({
      srcDir: root,
      componentModules: [
        resolve(root, 'components/Chip.tsx'),
        resolve(root, 'components/Orphan.tsx'),
      ],
      storyFiles: listStoryFiles(root),
      allowlist: {},
    });
    expect(errors).toEqual(['components/Orphan.tsx: exports a component but no story imports it.']);
  });

  it('accepts an allowlisted module with a reason', () => {
    const root = tree();
    const errors = checkStoryCoverage({
      srcDir: root,
      componentModules: [
        resolve(root, 'components/Chip.tsx'),
        resolve(root, 'components/Orphan.tsx'),
      ],
      storyFiles: listStoryFiles(root),
      allowlist: { 'components/Orphan.tsx': 'Predates the story-coverage gate.' },
    });
    expect(errors).toEqual([]);
  });

  it('rejects an allowlist entry with a blank reason', () => {
    const root = tree();
    const errors = checkStoryCoverage({
      srcDir: root,
      componentModules: [
        resolve(root, 'components/Chip.tsx'),
        resolve(root, 'components/Orphan.tsx'),
      ],
      storyFiles: listStoryFiles(root),
      allowlist: { 'components/Orphan.tsx': '   ' },
    });
    expect(errors).toEqual([
      'components/Orphan.tsx: allowlist entry needs a reason explaining why it has no story.',
    ]);
  });

  it('ratchets: an allowlisted module that gained a story is itself a violation', () => {
    const root = tree();
    const errors = checkStoryCoverage({
      srcDir: root,
      componentModules: [resolve(root, 'components/Chip.tsx')],
      storyFiles: listStoryFiles(root),
      allowlist: { 'components/Chip.tsx': 'Predates the story-coverage gate.' },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('has a story now');
  });

  it('ratchets: an allowlist entry naming a module that is no longer exported is a violation', () => {
    const root = tree();
    const errors = checkStoryCoverage({
      srcDir: root,
      componentModules: [resolve(root, 'components/Chip.tsx')],
      storyFiles: listStoryFiles(root),
      allowlist: { 'components/Deleted.tsx': 'Predates the story-coverage gate.' },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('no longer an exported component module');
  });

  it('treats discovering zero component modules as a violation, not a clean run', () => {
    const root = tree();
    const errors = checkStoryCoverage({
      srcDir: root,
      componentModules: [],
      storyFiles: listStoryFiles(root),
      allowlist: {},
    });
    expect(errors).toEqual([
      'no exported component module was discovered at all — the src/index.ts barrel scan is broken.',
    ]);
  });

  it('treats discovering zero story files as a violation, not a clean run', () => {
    const root = tree();
    const errors = checkStoryCoverage({
      srcDir: root,
      componentModules: [resolve(root, 'components/Chip.tsx')],
      storyFiles: [],
      allowlist: {},
    });
    expect(errors).toEqual([
      'no *.stories.tsx file was discovered at all — story discovery is broken.',
    ]);
  });
});

describe('the real @pops/ui tree', () => {
  it('parses every @pops/app-* alias out of .storybook/main.ts', () => {
    const aliases = readAliases();
    expect(aliases.length).toBeGreaterThan(0);
    expect(aliases.every((alias) => alias.replacement.endsWith('/app/src'))).toBe(true);
  });

  it('passes both invariants', () => {
    expect(run()).toBe(true);
  });
});
