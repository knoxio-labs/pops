/**
 * ADR-045: a guard ships with a test proving it REPORTS, not merely that it
 * passes. The tree is token-clean today, so a suite that only ran the guard
 * would be green whether or not the matcher still works. These drive the pure
 * core over source it must flag, over source it must not, and over the real
 * frontend tree — so a matcher that silently stops matching, or a discovery
 * walk that silently stops finding files, fails here.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { findViolations, isScannable } from '../check-design-tokens.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const guard = join(repoRoot, 'scripts', 'ci', 'check-design-tokens.mjs');

function texts(source: string): string[] {
  return findViolations('pillars/x/app/src/A.tsx', source).map((v) => v.text);
}

describe('raw palette utilities are reported', () => {
  it.each([
    ['a bare utility', '<div className="bg-amber-500" />', 'bg-amber-500'],
    ['a dark: variant', '<p className="dark:text-emerald-400" />', 'dark:text-emerald-400'],
    [
      'a stacked variant chain',
      '<p className="md:dark:hover:bg-sky-600" />',
      'md:dark:hover:bg-sky-600',
    ],
    ['an arbitrary variant', '<p className="[&>div]:bg-red-600" />', '[&>div]:bg-red-600'],
    [
      'a data variant',
      '<p className="data-[state=open]:bg-rose-500" />',
      'data-[state=open]:bg-rose-500',
    ],
    ['an opacity modifier', "const c = 'border-violet-500/20';", 'border-violet-500/20'],
    ['a divide utility', '<ul className="divide-slate-100" />', 'divide-slate-100'],
    ['a gradient stop', '<h1 className="from-indigo-500" />', 'from-indigo-500'],
    ['a print variant', '<td className="print:border-gray-300" />', 'print:border-gray-300'],
  ])('%s', (_label, source, expected) => {
    expect(texts(source)).toContain(expected);
  });

  it('reports every occurrence on a line, not just the first', () => {
    expect(texts('<div className="bg-amber-100 text-amber-900 border-amber-500" />')).toHaveLength(
      3
    );
  });

  it('reports each hue with the token a reader should reach for instead', () => {
    const byHue = Object.fromEntries(
      findViolations(
        'a.tsx',
        ['bg-red-500', 'bg-emerald-500', 'bg-amber-500', 'bg-sky-500'].join('\n')
      ).map((v) => [v.text, v.hint])
    );
    expect(byHue['bg-red-500']).toBe('destructive');
    expect(byHue['bg-emerald-500']).toBe('success');
    expect(byHue['bg-amber-500']).toBe('warning');
    expect(byHue['bg-sky-500']).toBe('info');
  });
});

describe('literal colours inside arbitrary values are reported', () => {
  it.each([
    ['oklch', '<h1 className="from-[oklch(0.7_0.2_150)]" />'],
    ['hex', '<h1 className="text-[#ff0000]" />'],
    ['rgb', '<h1 className="bg-[rgb(0,0,0)]" />'],
    ['hsl', '<h1 className="bg-[hsl(220,70%,55%)]" />'],
  ])('%s', (_label, source) => {
    expect(findViolations('a.tsx', source).filter((v) => v.kind === 'literal')).toHaveLength(1);
  });
});

describe('token-only source is silent', () => {
  it.each([
    'bg-warning text-warning-foreground',
    'dark:text-success/80 border-destructive/20',
    'bg-stat-orange/10 text-stat-violet ring-info/40',
    'w-[var(--radix-popover-trigger-width)] min-h-[44px] aspect-[2/3]',
    'grid-cols-[auto_1fr] transition-[color,box-shadow]',
    '--stat-orange-foreground: oklch(0.2 0.04 50);',
    'shadow-[0_0_20px_-12px_color-mix(in_oklch,var(--warning)_40%,transparent)]',
  ])('%s', (source) => {
    expect(findViolations('a.tsx', source)).toEqual([]);
  });

  it('does not mistake an object key ending in a colon for a variant chain', () => {
    expect(findViolations('a.tsx', "const t = { high: 'bg-destructive/10' };")).toEqual([]);
  });
});

describe('scan scope', () => {
  it.each([
    'pillars/food/app/src/pages/PlanPage.tsx',
    'pillars/shell/src/app/layout/TopBar.tsx',
    'libs/ui/src/components/TreeView.tsx',
    'libs/navigation/src/search-results/SectionView.tsx',
  ])('scans %s', (path) => {
    expect(isScannable(path)).toBe(true);
  });

  it.each([
    'libs/ui/src/primitives/Badge.stories.tsx',
    'pillars/food/app/src/pages/PlanPage.test.tsx',
    'pillars/shell/e2e/media-library.spec.ts',
    'libs/ui/src/__tests__/helper.ts',
    'libs/ui/src/theme/globals.css',
    'libs/ui/.storybook/preview.tsx',
    'pillars/food/app/src/lists-api/types.gen.ts',
    'pillars/food/README.md',
  ])('exempts %s', (path) => {
    expect(isScannable(path)).toBe(false);
  });
});

describe('the guard as CI runs it', () => {
  // Discovery is the half a unit test cannot fake: a walk that finds nothing
  // reports nothing and exits 0. The guard carries its own floor; this proves
  // the floor is met by the real tree rather than by a fixture.
  it('passes on the real tree and says how much it looked at', () => {
    const stdout = execFileSync(process.execPath, [guard], { encoding: 'utf8' });
    const scanned = Number(/Scanned (\d+) frontend source file/.exec(stdout)?.[1] ?? '0');
    expect(scanned).toBeGreaterThan(200);
    expect(stdout).toContain('OK —');
  });

  it('self-tests clean', () => {
    const stdout = execFileSync(process.execPath, [guard, '--self-test'], { encoding: 'utf8' });
    expect(stdout).toContain('self-test OK');
  });

  it('reports the violation it exists for, on real committed source', () => {
    // The guard's whole value is that this file — a live component — would be
    // flagged if its token were swapped back for the palette utility it used
    // to carry. Read the real file, plant the regression in memory, and check.
    const path = 'pillars/food/app/src/pages/plan/PlanCell.tsx';
    const source = readFileSync(join(repoRoot, path), 'utf8');
    expect(findViolations(path, source)).toEqual([]);
    const regressed = source.replace("'bg-success/10'", "'bg-green-100/30'");
    expect(regressed).not.toBe(source);
    expect(findViolations(path, regressed)).toContainEqual(
      expect.objectContaining({ file: path, kind: 'palette', text: 'bg-green-100/30' })
    );
  });
});
