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
  readReexportSpecifiers,
  readValueImportSpecifiers,
  resolveRelativeImport,
} from '../story-coverage.mjs';
import { STORY_COVERAGE_ALLOWLIST } from '../storybook-coverage-allowlist.mjs';

/**
 * The guard fails a stale allowlist entry but happily accepts a new one, so on
 * its own the list can grow to cover every export one honest line at a time
 * with every run green. Pinning the size makes taking debt on a visible edit
 * here: lower it when an entry earns a story, raise it only deliberately.
 */
const ALLOWLIST_PINNED_SIZE = 35;

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

  it('matches double-quoted specifiers too — oxfmt enforces single quotes today, but that is a formatter setting, not a contract this scan should depend on', () => {
    const source = 'import { Chip } from "./Chip";';
    expect(readValueImportSpecifiers(source)).toEqual(['./Chip']);
  });
});

describe('readReexportSpecifiers', () => {
  it('collects only `export ... from` specifiers, not plain `import` statements', () => {
    const source = [
      "import { Helper } from './Helper';",
      "export { Chip } from './Chip';",
      "export * from './Badge';",
      "export * as widgets from './widgets';",
      "export type { Density } from './types';",
    ].join('\n');
    expect(readReexportSpecifiers(source).toSorted()).toEqual(
      ['./Badge', './Chip', './widgets'].toSorted()
    );
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

  it('finds a default export that forwards a previously declared identifier — `const X = …; export default X;` — not only `export default function X`', () => {
    const source = ['const DefaultOnly = () => null;', 'export default DefaultOnly;'].join('\n');
    expect(readComponentExports(source)).toEqual(['DefaultOnly']);
  });

  it('finds `export { X as default }`, crediting the original name rather than the non-PascalCase "default"', () => {
    const source = ['function Aliased() { return null; }', 'export { Aliased as default };'].join(
      '\n'
    );
    expect(readComponentExports(source)).toEqual(['Aliased']);
  });

  describe('requireTsComponentShape — the narrowed .ts rule', () => {
    it('excludes a PascalCase zod schema even in a file with a react import elsewhere, since the schema itself is a call expression, not a function', () => {
      const source = [
        "import { createElement } from 'react';",
        "import { z } from 'zod';",
        'export const ReceiptSchema = z.object({ total: z.number() });',
        "export const Icon = () => createElement('svg');",
      ].join('\n');
      expect(readComponentExports(source, { requireTsComponentShape: true })).toEqual(['Icon']);
    });

    it('excludes a PascalCase token map (plain object literal)', () => {
      const source = [
        "import { createElement } from 'react';",
        "export const ThemeTokens = { bg: '#fff' };",
        "export const Icon = () => createElement('svg');",
      ].join('\n');
      expect(readComponentExports(source, { requireTsComponentShape: true })).toEqual(['Icon']);
    });

    it('excludes a plain PascalCase class with no base class', () => {
      const source = [
        "import { createElement } from 'react';",
        'export class ApiClient {}',
        "export const Icon = () => createElement('svg');",
      ].join('\n');
      expect(readComponentExports(source, { requireTsComponentShape: true })).toEqual(['Icon']);
    });

    it('excludes every PascalCase export, including a real function shape, when the file never shows a createElement signal — .ts has no other way to build an element', () => {
      const source = [
        "export const Foo = () => 'not an element';",
        'export function Bar() {}',
      ].join('\n');
      expect(readComponentExports(source, { requireTsComponentShape: true })).toEqual([]);
    });

    it('keeps a function-declared, arrow-declared and extends-shaped export once the file shows a createElement signal', () => {
      const source = [
        "import { createElement, Component } from 'react';",
        "export function FnComponent() { return createElement('div'); }",
        "export const ArrowComponent = () => createElement('span');",
        'export class ClassComponent extends Component {}',
      ].join('\n');
      expect(readComponentExports(source, { requireTsComponentShape: true }).toSorted()).toEqual(
        ['ArrowComponent', 'ClassComponent', 'FnComponent'].toSorted()
      );
    });

    it('does not filter forwarded names — a forward is checked at the module that actually declares it, not here', () => {
      const source = [
        'export const ReceiptSchema = z.object({});',
        "export { RealThing } from './real-thing';",
      ].join('\n');
      expect(readComponentExports(source, { requireTsComponentShape: true })).toEqual([
        'RealThing',
      ]);
    });

    it('leaves .tsx-style discovery unchanged: without the option, a schema-shaped export is still treated as a subject — the same false-positive risk name-only discovery has always carried', () => {
      const source = 'export const ReceiptSchema = z.object({ total: z.number() });';
      expect(readComponentExports(source)).toEqual(['ReceiptSchema']);
    });

    describe('component wrappers (memo/forwardRef) — POPS-2232', () => {
      it('includes a memo-wrapped arrow that builds an element, previously excluded because the declaration reads as a call, not an arrow', () => {
        const source = [
          "import { memo, createElement } from 'react';",
          "export const Foo = memo(() => createElement('div'));",
        ].join('\n');
        expect(readComponentExports(source, { requireTsComponentShape: true })).toEqual(['Foo']);
      });

      it('includes a forwardRef-wrapped component with generics and a destructured, spread-forwarding arrow', () => {
        const source = [
          "import { createElement, forwardRef } from 'react';",
          'export const Bar = forwardRef<HTMLInputElement, { value: string }>((props, ref) =>',
          "  createElement('input', { ...props, ref })",
          ');',
        ].join('\n');
        expect(readComponentExports(source, { requireTsComponentShape: true })).toEqual(['Bar']);
      });

      it('includes a namespace-qualified React.forwardRef with a multi-line generic argument list', () => {
        const source = [
          "import * as React from 'react';",
          'export const Label = React.forwardRef<',
          '  HTMLDivElement,',
          '  { text: string }',
          ">((props, ref) => React.createElement('div', props, props.text));",
        ].join('\n');
        expect(readComponentExports(source, { requireTsComponentShape: true })).toEqual(['Label']);
      });

      it('keeps a memo-wrapped non-component excluded when the file shows no createElement signal at all — the rule cannot tell a memo-wrapped object-returning function from a memo-wrapped component, and relies entirely on the file-level gate to stay closed', () => {
        const source = [
          "import { memo } from 'react';",
          'export const CachedConfig = memo(() => ({ retries: 3 }));',
        ].join('\n');
        expect(readComponentExports(source, { requireTsComponentShape: true })).toEqual([]);
      });

      it('does not unwrap a wrapper nested two calls deep — memo(forwardRef(...)) is not a single call expression, and is undecidable by this rule', () => {
        const source = [
          "import { memo, forwardRef, createElement } from 'react';",
          "export const Foo = memo(forwardRef((props, ref) => createElement('div', { ...props, ref })));",
        ].join('\n');
        expect(readComponentExports(source, { requireTsComponentShape: true })).toEqual([]);
      });

      it('does not follow an aliased wrapper import — fr(...) is not textually "forwardRef(...)", and is undecidable by this rule', () => {
        const source = [
          "import { forwardRef as fr, createElement } from 'react';",
          "export const Foo = fr(() => createElement('div'));",
        ].join('\n');
        expect(readComponentExports(source, { requireTsComponentShape: true })).toEqual([]);
      });

      it('does not treat a same-named export from a non-React package as a component wrapper, even though a real createElement component sits in the same file', () => {
        const source = [
          "import { memo } from 'a-memoization-lib';",
          "import { createElement } from 'react';",
          "export const Real = () => createElement('div');",
          'export const Cached = memo(() => ({ cached: true }));',
        ].join('\n');
        expect(readComponentExports(source, { requireTsComponentShape: true })).toEqual(['Real']);
      });
    });
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
  it('keeps only barrel-exported modules that export a component — camelCase helpers and non-component constants are excluded regardless of extension', () => {
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

  it('discovers a component declared in a .ts file — no JSX, built with createElement, so no .tsx extension is required (POPS-2178)', () => {
    const root = makeTree({
      'index.ts': "export * from './components/TsOnly';",
      'components/TsOnly.ts': [
        "import { createElement } from 'react';",
        "export const TsOnly = () => createElement('div');",
      ].join('\n'),
    });
    expect(listExportedComponentModules(root)).toEqual([resolve(root, 'components/TsOnly.ts')]);
  });

  it('does not treat the root barrel itself as a component module even though it re-exports PascalCase names via `export { X, Y } from` — only the file that declares them is the subject', () => {
    const root = makeTree({
      'index.ts': "export { Button as ButtonPrimitive } from './components/button';",
      'components/button.ts': [
        "import { createElement } from 'react';",
        "export const Button = () => createElement('button');",
      ].join('\n'),
    });
    expect(listExportedComponentModules(root)).toEqual([resolve(root, 'components/button.ts')]);
  });

  it('does not treat a barrel-exported .ts zod schema as a subject — a PascalCase name whose declaration is a call expression, not a function/arrow/class', () => {
    const root = makeTree({
      'index.ts': "export * from './lib/ReceiptSchema';",
      'lib/ReceiptSchema.ts': [
        "import { z } from 'zod';",
        'export const ReceiptSchema = z.object({ total: z.number() });',
      ].join('\n'),
    });
    expect(listExportedComponentModules(root)).toEqual([]);
  });

  it('does not treat a barrel-exported .ts plain class as a subject — no base class, so no rendering surface', () => {
    const root = makeTree({
      'index.ts': "export * from './lib/ApiClient';",
      'lib/ApiClient.ts': 'export class ApiClient {\n  constructor(private url: string) {}\n}',
    });
    expect(listExportedComponentModules(root)).toEqual([]);
  });

  it('does not treat a barrel-exported .ts token map as a subject — a plain object literal, not a function', () => {
    const root = makeTree({
      'index.ts': "export * from './lib/ThemeTokens';",
      'lib/ThemeTokens.ts': "export const ThemeTokens = { bg: '#fff' };",
    });
    expect(listExportedComponentModules(root)).toEqual([]);
  });

  it('still discovers a real .ts component sitting alongside a non-component export in the same file — the shape check is per-name, not per-file', () => {
    const root = makeTree({
      'index.ts': "export * from './lib/mixed';",
      'lib/mixed.ts': [
        "import { createElement } from 'react';",
        "import { z } from 'zod';",
        'export const ReceiptSchema = z.object({ total: z.number() });',
        "export const ReceiptIcon = () => createElement('svg');",
      ].join('\n'),
    });
    expect(listExportedComponentModules(root)).toEqual([resolve(root, 'lib/mixed.ts')]);
  });

  it('throws instead of reporting an empty set when the barrel is missing', () => {
    const root = makeTree({ 'components/Chip.tsx': 'export const Chip = () => null;' });
    expect(() => listExportedComponentModules(root)).toThrow(/barrel not found/);
  });

  it('discovers a default-export-only module — the barrel forwards it via `export { default as X }` and the module itself only has `export default X;`', () => {
    const root = makeTree({
      'index.ts': "export { default as DefaultOnly } from './components/DefaultOnly';",
      'components/DefaultOnly.tsx': [
        'const DefaultOnly = () => null;',
        'export default DefaultOnly;',
      ].join('\n'),
    });
    expect(listExportedComponentModules(root)).toEqual([
      resolve(root, 'components/DefaultOnly.tsx'),
    ]);
  });

  it('recurses into a nested directory barrel instead of stopping at the non-.tsx target', () => {
    const root = makeTree({
      'index.ts': "export * from './components/widgets';",
      'components/widgets/index.ts': "export * from './Gadget';",
      'components/widgets/Gadget.tsx': 'export const Gadget = () => null;',
    });
    expect(listExportedComponentModules(root)).toEqual([
      resolve(root, 'components/widgets/Gadget.tsx'),
    ]);
  });

  it('follows a re-export chain two levels deep to the file that actually declares the component — a pure forwarder in the middle is a barrel, not a subject in its own right', () => {
    const root = makeTree({
      'index.ts': "export * from './components/Parent';",
      'components/Parent.tsx': "export { Child } from './Parent.child';",
      'components/Parent.child.tsx': 'export const Child = () => null;',
    });
    // Parent.tsx's only export is a forward of `Child` — it declares nothing
    // of its own, so by the same structural rule that exempts index.ts it is
    // a barrel: recursion still reaches Parent.child.tsx, but Parent.tsx
    // itself is not a subject demanding its own story. This differs from the
    // real ScrollShelf.tsx/ScrollShelf.lazy.tsx pair: ScrollShelf.tsx forwards
    // LazyScrollShelf *and* declares its own ScrollShelf component, so it
    // keeps a rendering surface a story would actually exercise and remains
    // a subject — see the "declares one component and forwards another"
    // case below.
    expect(listExportedComponentModules(root)).toEqual([
      resolve(root, 'components/Parent.child.tsx'),
    ]);
  });

  it('does not treat a nested barrel as a subject when it re-exports a component by name, not just by `export *` — the shape a real directory-of-components barrel takes', () => {
    const root = makeTree({
      'index.ts': "export * from './components/widgets';",
      'components/widgets/index.ts': "export { Widget } from './Widget';",
      'components/widgets/Widget.tsx': 'export const Widget = () => null;',
    });
    expect(listExportedComponentModules(root)).toEqual([
      resolve(root, 'components/widgets/Widget.tsx'),
    ]);
  });

  it('treats a nested barrel as a subject once it also declares a component locally, alongside forwarding another', () => {
    const root = makeTree({
      'index.ts': "export * from './components/widgets';",
      'components/widgets/index.ts': [
        'export const WidgetGroup = () => null;',
        "export { Widget } from './Widget';",
      ].join('\n'),
      'components/widgets/Widget.tsx': 'export const Widget = () => null;',
    });
    expect(listExportedComponentModules(root).toSorted()).toEqual(
      [
        resolve(root, 'components/widgets/index.ts'),
        resolve(root, 'components/widgets/Widget.tsx'),
      ].toSorted()
    );
  });

  it('does not follow a plain `import` a component file uses to compose its own render tree — only `export ... from` publishes a module as its own subject', () => {
    const root = makeTree({
      'index.ts': "export * from './components/Parent';",
      'components/Parent.tsx': [
        "import { Helper } from './Parent.helper';",
        'export const Parent = () => Helper();',
      ].join('\n'),
      'components/Parent.helper.tsx': 'export const Helper = () => null;',
    });
    expect(listExportedComponentModules(root)).toEqual([resolve(root, 'components/Parent.tsx')]);
  });

  it('does not lose a module behind an `export * as ns from` namespace re-export', () => {
    const root = makeTree({
      'index.ts': "export * as widgets from './components/widgets';",
      'components/widgets.tsx': 'export const Widget = () => null;',
    });
    expect(listExportedComponentModules(root)).toEqual([resolve(root, 'components/widgets.tsx')]);
  });

  it('discovers a .ts component wrapped in memo — POPS-2232, the gap #4147 left open', () => {
    const root = makeTree({
      'index.ts': "export * from './components/MemoOnly';",
      'components/MemoOnly.ts': [
        "import { memo, createElement } from 'react';",
        "export const MemoOnly = memo(() => createElement('div'));",
      ].join('\n'),
    });
    expect(listExportedComponentModules(root)).toEqual([resolve(root, 'components/MemoOnly.ts')]);
  });

  it('discovers a .ts component wrapped in forwardRef — POPS-2232, the gap #4147 left open', () => {
    const root = makeTree({
      'index.ts': "export * from './components/ForwardRefOnly';",
      'components/ForwardRefOnly.ts': [
        "import { createElement, forwardRef } from 'react';",
        'export const ForwardRefOnly = forwardRef((props, ref) =>',
        "  createElement('input', { ...props, ref })",
        ');',
      ].join('\n'),
    });
    expect(listExportedComponentModules(root)).toEqual([
      resolve(root, 'components/ForwardRefOnly.ts'),
    ]);
  });

  it('still excludes a .ts memo-wrapped non-component with no createElement anywhere in the file — POPS-2232 closes the wrapper gap without reopening the schema/tokens/class false-positive #4147 closed', () => {
    const root = makeTree({
      'index.ts': "export * from './lib/CachedConfig';",
      'lib/CachedConfig.ts': [
        "import { memo } from 'react';",
        'export const CachedConfig = memo(() => ({ retries: 3 }));',
      ].join('\n'),
    });
    expect(listExportedComponentModules(root)).toEqual([]);
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

describe('end-to-end: a .ts-declared component with no story (POPS-2178)', () => {
  function pipeline(root: string) {
    const componentModules = listExportedComponentModules(root);
    const storyFiles = listStoryFiles(root);
    return checkStoryCoverage({ srcDir: root, componentModules, storyFiles, allowlist: {} });
  }

  it('fails, naming the .ts component, when discovery runs through listExportedComponentModules and checkStoryCoverage together — not just when componentModules is hand-supplied', () => {
    const root = makeTree({
      'index.ts': [
        "export * from './components/TsOnly';",
        "export * from './components/Chip';",
      ].join('\n'),
      'components/TsOnly.ts': [
        "import { createElement } from 'react';",
        "export const TsOnly = () => createElement('div');",
      ].join('\n'),
      'components/Chip.tsx': 'export const Chip = () => null;',
      'components/Chip.stories.tsx': "import { Chip } from './Chip';",
    });
    expect(pipeline(root)).toEqual([
      'components/TsOnly.ts: exports a component but no story imports it.',
    ]);
  });

  it('passes once the .ts component gains a story', () => {
    const root = makeTree({
      'index.ts': [
        "export * from './components/TsOnly';",
        "export * from './components/Chip';",
      ].join('\n'),
      'components/TsOnly.ts': [
        "import { createElement } from 'react';",
        "export const TsOnly = () => createElement('div');",
      ].join('\n'),
      'components/TsOnly.stories.tsx': "import { TsOnly } from './TsOnly';",
      'components/Chip.tsx': 'export const Chip = () => null;',
      'components/Chip.stories.tsx': "import { Chip } from './Chip';",
    });
    expect(pipeline(root)).toEqual([]);
  });
});

describe('end-to-end: a .ts non-component export does not demand a story', () => {
  function pipeline(root: string) {
    const componentModules = listExportedComponentModules(root);
    const storyFiles = listStoryFiles(root);
    return checkStoryCoverage({ srcDir: root, componentModules, storyFiles, allowlist: {} });
  }

  it('passes with a barrel-exported zod schema and a plain class, neither storied, alongside a real storied .tsx component', () => {
    const root = makeTree({
      'index.ts': [
        "export * from './lib/ReceiptSchema';",
        "export * from './lib/ApiClient';",
        "export * from './components/Chip';",
      ].join('\n'),
      'lib/ReceiptSchema.ts': [
        "import { z } from 'zod';",
        'export const ReceiptSchema = z.object({ total: z.number() });',
      ].join('\n'),
      'lib/ApiClient.ts': 'export class ApiClient {\n  constructor(private url: string) {}\n}',
      'components/Chip.tsx': 'export const Chip = () => null;',
      'components/Chip.stories.tsx': "import { Chip } from './Chip';",
    });
    expect(pipeline(root)).toEqual([]);
  });

  it('still fails, naming the .ts component and not the schema, when a real .ts component sits unstoried next to a schema in the same barrel', () => {
    const root = makeTree({
      'index.ts': [
        "export * from './lib/ReceiptSchema';",
        "export * from './components/TsOnly';",
        "export * from './components/Chip';",
      ].join('\n'),
      'lib/ReceiptSchema.ts': [
        "import { z } from 'zod';",
        'export const ReceiptSchema = z.object({ total: z.number() });',
      ].join('\n'),
      'components/TsOnly.ts': [
        "import { createElement } from 'react';",
        "export const TsOnly = () => createElement('div');",
      ].join('\n'),
      'components/Chip.tsx': 'export const Chip = () => null;',
      'components/Chip.stories.tsx': "import { Chip } from './Chip';",
    });
    expect(pipeline(root)).toEqual([
      'components/TsOnly.ts: exports a component but no story imports it.',
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

  it('scopes coverage to the module, not the individual export — documented tradeoff (see the file header): appending a new component to an already-storied file is accepted, not flagged', () => {
    const root = makeTree({
      'components/Chip.tsx': [
        'export const Chip = () => null;',
        'export const SneakyNewThing = () => null;',
      ].join('\n'),
      'components/Chip.stories.tsx': "import { Chip } from './Chip';",
    });
    const errors = checkStoryCoverage({
      srcDir: root,
      componentModules: [resolve(root, 'components/Chip.tsx')],
      storyFiles: listStoryFiles(root),
      allowlist: {},
    });
    expect(errors).toEqual([]);
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

  it('holds the allowlist at its pinned size', () => {
    expect(Object.keys(STORY_COVERAGE_ALLOWLIST)).toHaveLength(ALLOWLIST_PINNED_SIZE);
  });
});
