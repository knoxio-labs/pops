import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  auditTree,
  conditionSpecificity,
  conditionsExclusive,
  extractElements,
  findConflicts,
  floorViolations,
  parseClass,
  propertiesOf,
  scopeOf,
} from '../check-tailwind-cascade-conflicts.mjs';

const REAL_SUBPROCESS_TIMEOUT_MS = 60_000;

const SHELL = { variant: true, plain: false };
const PILLAR = { variant: true, plain: true };

function pairs(src: string, scope = SHELL): string[] {
  return findConflicts('fixture.tsx', src, scope).map((c) =>
    c.error === undefined ? `${c.first}|${c.second}` : `error:${c.error}`
  );
}

describe('propertiesOf', () => {
  it.each([
    ['hidden', ['display']],
    ['inline-flex', ['display']],
    ['sticky', ['position']],
    ['p-2', ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']],
    ['px-4', ['padding-right', 'padding-left']],
    ['-mt-2', ['margin-top']],
    ['size-4', ['width', 'height']],
    ['max-w-lg', ['max-width']],
    ['flex-col', ['flex-direction']],
    ['flex-1', ['flex-grow', 'flex-shrink', 'flex-basis']],
    ['shrink-0', ['flex-shrink']],
    ['justify-between', ['justify-content']],
    ['grid-cols-3', ['grid-template-columns']],
    ['col-span-2', ['grid-column-start', 'grid-column-end']],
    ['gap-x-2', ['column-gap']],
    ['text-sm', ['font-size']],
    ['text-2xs', ['font-size']],
    ['text-[13px]', ['font-size']],
    ['text-center', ['text-align']],
    ['text-muted-foreground', ['color']],
    ['bg-muted/50', ['background-color']],
    ['bg-cover', ['background-size']],
    ['bg-linear-to-r', ['background-image']],
  ])('%s sets %j', (utility, expected) => {
    expect(propertiesOf(utility)).toEqual(expected);
  });

  it.each(['rounded-md', 'pointer-events-none', 'max-lg', 'text-ellipsis', 'mix-blend-multiply'])(
    '%s is outside every group',
    (utility) => {
      expect(propertiesOf(utility)).toEqual([]);
    }
  );
});

describe('parseClass', () => {
  it('splits variants on top-level colons only', () => {
    const parsed = parseClass('[&:nth-child(3)]:md:p-2');
    expect(parsed.variants).toBe('[&:nth-child(3)]:md');
    expect(parsed.utility).toBe('p-2');
  });

  it('separates variants that move the rule to another node from conditions', () => {
    const parsed = parseClass('hover:[&_svg]:size-4');
    expect(parsed.target).toBe('[&_svg]');
    expect(parsed.conditions).toEqual(['hover']);
  });

  it('reads either spelling of the important modifier', () => {
    expect(parseClass('md:!p-2')).toMatchObject({ utility: 'p-2', important: true });
    expect(parseClass('md:p-2!')).toMatchObject({ utility: 'p-2', important: true });
    expect(parseClass('md:p-2')).toMatchObject({ important: false });
  });
});

describe('conditionSpecificity', () => {
  it('counts media variants as nothing and selector variants as one class', () => {
    expect(conditionSpecificity(['md', 'max-lg', 'print'])).toBe(0);
    expect(conditionSpecificity(['hover', 'dark'])).toBe(2000);
    expect(conditionSpecificity(['not-data-[state=open]'])).toBe(1000);
    expect(conditionSpecificity(['[a&]'])).toBe(1);
  });

  it('refuses to guess an arbitrary or unknown variant', () => {
    expect(conditionSpecificity(['[&:nth-child(3)]'])).toBeUndefined();
    expect(conditionSpecificity(['some-plugin-variant'])).toBeUndefined();
  });
});

describe('conditionsExclusive', () => {
  it.each([
    [['data-[size=sm]'], ['data-[size=lg]']],
    [['group-data-[size=sm]/avatar'], ['group-data-[size=lg]/avatar']],
    [['[a&]'], ['[button&]']],
    [['not-dark', 'hover'], ['dark']],
    [['md', 'max-lg'], ['lg']],
    [['sm', 'max-lg'], ['xl']],
    [['xl'], ['sm', 'max-md']],
    [['lg', 'max-xl'], ['2xl']],
  ])('%j and %j never hold together', (a, b) => {
    expect(conditionsExclusive(a, b)).toBe(true);
  });

  it.each([
    [['md'], ['lg']],
    [['sm', 'max-xl'], ['lg']],
    [['max-lg'], ['md']],
    [['max-lg'], ['max-xl']],
    [['hover'], ['dark']],
    [['data-[size=sm]'], ['data-[state=open]']],
    [['group-data-[size=sm]/a'], ['group-data-[size=lg]/b']],
  ])('%j and %j can hold together', (a, b) => {
    expect(conditionsExclusive(a, b)).toBe(false);
  });
});

describe('extractElements', () => {
  it('reads a string attribute, an expression attribute and a standalone call', () => {
    const src = [
      '<a className="p-2" />',
      "<b className={cn('p-3', x)} />",
      "const c = cva('p-4');",
    ].join('\n');
    const texts = extractElements(src).map((e) => e.literals.map((l) => l.text));
    expect(texts).toEqual([['p-2'], ['p-3'], ['p-4']]);
  });

  it('does not count a cn() call inside an attribute twice', () => {
    expect(extractElements("<a className={cn('p-2')} />")).toHaveLength(1);
  });

  it('reads *ClassName props too', () => {
    const [element] = extractElements('<Dialog contentClassName="md:p-2 lg:p-4" />');
    expect(element?.literals.map((l) => l.text)).toEqual(['md:p-2 lg:p-4']);
  });

  it('drops the half of a class a template expression cuts', () => {
    const [element] = extractElements('<a className={`gap-2 p-${n} flex`} />');
    expect(element?.literals.map((l) => l.text.trim()).filter(Boolean)).toEqual(['gap-2', 'flex']);
  });

  it('reads a clsx object key as a class and its value as a condition', () => {
    const [element] = extractElements("<a className={cn({ 'p-2': big === 'yes' })} />");
    expect(element?.literals.map((l) => l.text)).toEqual(['p-2']);
  });

  it('marks literals under cn() or twMerge() as merged, and clsx() as not', () => {
    const merged = extractElements("<a className={cn('p-2')} />")[0]?.literals[0]?.merged;
    const plain = extractElements("<a className={clsx('p-2')} />")[0]?.literals[0]?.merged;
    expect([merged, plain]).toEqual([true, false]);
  });

  it('reports an expression whose brackets never balance instead of skipping it', () => {
    const [element] = extractElements("<a className={cn('p-2', (x && 'p-4')} />");
    expect(element?.error).toBe('unbalanced }');
  });

  it('reports an unterminated string', () => {
    expect(extractElements('<a className="p-2\n" />')[0]?.error).toBe('unterminated string');
  });

  it('skips a className in a comment', () => {
    expect(extractElements('// <a className="p-2 p-4" />\n * className="p-2"')).toEqual([]);
  });
});

describe('findConflicts, case 1: two variants of one property (shell, libs, pillar apps)', () => {
  it('reports the md:flex lg:hidden shape, in a string and across cn() arguments', () => {
    expect(pairs('<nav className="hidden md:flex lg:hidden" />')).toEqual(['md:flex|lg:hidden']);
    expect(pairs("<a className={cn('md:flex', open && 'lg:hidden')} />")).toEqual([
      'md:flex|lg:hidden',
    ]);
  });

  it('reports a pair tailwind-merge leaves alone, even inside cn()', () => {
    expect(pairs("<a className={cn('md:p-6 lg:p-8')} />")).toEqual(['md:p-6|lg:p-8']);
  });

  it('reports equal-specificity state variants with nothing to decide between them', () => {
    expect(pairs('<tr className="hover:bg-muted/50 data-[state=selected]:bg-muted" />')).toEqual([
      'hover:bg-muted/50|data-[state=selected]:bg-muted',
    ]);
  });

  it('reports every overlapping step of an open grid ladder in a pillar app', () => {
    expect(
      pairs('<div className="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" />', PILLAR)
    ).toEqual([
      'sm:grid-cols-3|md:grid-cols-4',
      'sm:grid-cols-3|lg:grid-cols-5',
      'md:grid-cols-4|lg:grid-cols-5',
    ]);
  });

  it('reports a range that ends above the breakpoint it competes with', () => {
    expect(pairs('<div className="sm:max-xl:grid-cols-2 lg:grid-cols-3" />', PILLAR)).toEqual([
      'sm:max-xl:grid-cols-2|lg:grid-cols-3',
    ]);
  });

  it('reports a pair whose specificity it cannot read', () => {
    expect(pairs('<a className="[&:nth-child(3)]:p-2 md:p-4" />')).toEqual([
      '[&:nth-child(3)]:p-2|md:p-4',
    ]);
  });

  it('reports two options of different cva variants', () => {
    expect(pairs("cva('', { variants: { a: { x: 'md:h-8' }, b: { y: 'lg:h-10' } } })")).toEqual([
      'md:h-8|lg:h-10',
    ]);
  });

  it.each([
    ['exclusive ranges', '<a className="hidden md:max-lg:block" />'],
    ['a breakpoint range against the next', '<a className="md:max-lg:p-6 lg:p-8" />'],
    [
      'a grid ladder of closed ranges',
      '<a className="grid-cols-2 sm:max-md:grid-cols-3 md:max-lg:grid-cols-4 lg:max-xl:grid-cols-5 xl:grid-cols-6" />',
      PILLAR,
    ],
    [
      'hover against a state it excludes',
      '<a className="hover:not-aria-checked:bg-muted aria-checked:bg-primary" />',
      PILLAR,
    ],
    ['hover outside print', '<tr className="not-print:hover:bg-a print:hover:bg-b" />', PILLAR],
    ['not-dark against dark', '<a className="not-dark:hover:bg-a dark:bg-b" />'],
    [
      'not-data against data',
      '<tr className="hover:not-data-[state=selected]:bg-a data-[state=selected]:bg-b" />',
    ],
    ['different specificity', '<a className="hover:bg-a dark:hover:bg-b" />'],
    ['a third class outranking both', '<a className="hover:bg-a dark:bg-b dark:hover:bg-c" />'],
    ['one value under two variants', '<a className="md:flex lg:flex" />'],
    ['other nodes', '<a className="[&_p]:my-1 [&_pre]:my-2" />'],
    ['important against normal', '<a className="md:p-2! lg:p-4" />'],
    ['ternary branches', "<a className={open ? 'md:flex' : 'lg:hidden'} />"],
    ['options of one cva variant', "cva('', { variants: { s: { a: 'md:h-8', b: 'lg:h-10' } } })"],
    ['cva defaultVariants', "cva('md:h-8', { defaultVariants: { size: 'lg:h-10' } })"],
  ])('does not report %s', (_label, src, scope = SHELL) => {
    expect(pairs(src, scope)).toEqual([]);
  });
});

describe('findConflicts, case 2: two plain utilities of one property (pillar apps)', () => {
  it('reports a same-property pair outside cn()', () => {
    expect(pairs('<div className="p-2 p-4" />', PILLAR)).toEqual(['p-2|p-4']);
  });

  it('reports a pair split between a template chunk and a ternary branch', () => {
    expect(pairs("<div className={`flex ${a ? 'hidden' : ''}`} />", PILLAR)).toEqual([
      'flex|hidden',
    ]);
  });

  it('reports a shorthand before its longhand even inside cn(), which keeps both', () => {
    expect(pairs("<div className={cn('p-2 px-4')} />", PILLAR)).toEqual(['p-2|px-4']);
  });

  it.each([
    ['a same-property pair cn() merges', "<a className={cn('p-2', big && 'p-4')} />"],
    ['a longhand before its shorthand in cn()', "<a className={cn('px-4 p-2')} />"],
    ['disjoint sides', '<a className="px-4 py-2" />'],
    ['different groups sharing a prefix', '<a className="text-sm text-primary" />'],
    ['a compared literal', "<a className={cn(size === 'p-2' && 'p-4')} />"],
    ['another call', "<a className={cn(t('p-2'), 'p-4')} />"],
    ['a shell file', '<a className="p-2 p-4" />', SHELL],
  ])('does not report %s', (_label, src, scope = PILLAR) => {
    expect(pairs(src, scope)).toEqual([]);
  });
});

describe('scopeOf', () => {
  it.each([
    ['pillars/shell/src/app/Nav.tsx', SHELL],
    ['libs/ui/src/primitives/button.tsx', SHELL],
    ['pillars/media/app/src/pages/Page.tsx', PILLAR],
  ])('%s is in scope', (path, scope) => {
    expect(scopeOf(path)).toEqual(scope);
  });

  it.each([
    'libs/ui/src/primitives/Button.stories.tsx',
    'libs/ui/src/primitives/button.test.tsx',
    'pillars/shell/e2e/shell.spec.ts',
    'pillars/finance/app/src/finance-api/client.ts',
    'pillars/finance/src/server.ts',
    'libs/ui/src/theme/globals.css',
  ])('%s is out of scope', (path) => {
    expect(scopeOf(path)).toBeUndefined();
  });
});

describe('auditTree and its floors (ADR-045 degenerate cases)', () => {
  let root: string | undefined;
  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  function tree(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'tailwind-cascade-test-'));
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    return dir;
  }

  it('reports planted conflicts through the real walk', () => {
    root = tree({
      'pillars/shell/src/Nav.tsx': '<nav className="md:block lg:hidden" />',
      'pillars/media/app/src/Card.tsx': '<div className="p-2 p-4" />',
      'pillars/media/app/src/Grid.tsx': '<div className="md:-mx-6 lg:-mx-8" />',
      'libs/ui/src/Ok.tsx': '<div className="p-2" />',
    });
    const { counts, conflicts } = auditTree(root);
    expect(conflicts.map((c) => `${c.kind}:${c.file}:${c.line}`)).toEqual([
      'plain:pillars/media/app/src/Card.tsx:1',
      'variant:pillars/media/app/src/Grid.tsx:1',
      'variant:pillars/shell/src/Nav.tsx:1',
    ]);
    expect(counts).toEqual({
      shell: { files: 2, elements: 2 },
      app: { files: 2, elements: 2 },
    });
  });

  it('fails the floors on a tree too small to be the repo', () => {
    root = tree({ 'pillars/shell/src/Ok.tsx': '', 'libs/ui/src/Ok.tsx': '' });
    expect(floorViolations(auditTree(root).counts)).toHaveLength(2);
  });

  it('throws on a tree with no libs/, rather than passing', () => {
    root = tree({ 'pillars/shell/src/Ok.tsx': '' });
    expect(() => auditTree(root ?? '')).toThrow(/scan root libs\/ is missing/);
  });
});

describe('the CLI', () => {
  const script = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'check-tailwind-cascade-conflicts.mjs'
  );

  it(
    'passes its own self-test',
    () => {
      expect(execFileSync('node', [script, '--self-test'], { encoding: 'utf8' })).toMatch(
        /self-test OK/
      );
    },
    REAL_SUBPROCESS_TIMEOUT_MS
  );

  it(
    'passes on the real tree',
    () => {
      expect(execFileSync('node', [script], { encoding: 'utf8' })).toMatch(/^OK: /m);
    },
    REAL_SUBPROCESS_TIMEOUT_MS
  );

  it(
    'rejects an unknown flag with exit 2',
    () => {
      expect(spawnSync('node', [script, '--write'], { encoding: 'utf8' }).status).toBe(2);
    },
    REAL_SUBPROCESS_TIMEOUT_MS
  );
});
