import { describe, expect, it } from 'vitest';

import { diffAgainstBaseline, findViolations, isScannable } from '../check-touch-targets.mjs';

describe('findViolations', () => {
  it('flags a raw button with no sizing evidence', () => {
    const src = ['<button type="button" onClick={onClick}>', '  Save', '</button>'].join('\n');
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
      { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
    ]);
  });

  it('flags a raw anchor with no sizing evidence', () => {
    const src = '<a href="/x" className="text-sm underline">link</a>';
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
      { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'a' },
    ]);
  });

  it('does not flag a button sized via a direct h-11/size-11/min-h-11/min-w-11 utility', () => {
    const src = [
      '<button className="size-11" onClick={onClick}><XIcon /></button>',
      '<button className="h-11 px-4" onClick={onClick}>Save</button>',
      '<a href="/x" className="min-w-11 min-h-11 flex items-center">link</a>',
    ].join('\n');
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
  });

  it('does not flag a button sized via an arbitrary >=44px pixel value', () => {
    const src = '<a href="/x" className="min-w-[44px] min-h-[48px] flex items-center">link</a>';
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
  });

  it('does not flag a compact button using the before:-inset-* expansion pattern', () => {
    const src =
      '<button className="relative before:absolute before:-inset-2.5 before:content-[\'\']">x</button>';
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
  });

  it('does not flag a sub-44px utility (h-8, size-9) with no other sizing evidence', () => {
    const src = '<button className="h-8 w-8" onClick={onClick}><XIcon /></button>';
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
      { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
    ]);
  });

  it.each([
    ['a margin that happens to be >=44px', 'h-6 w-6 mt-[80px]'],
    ['a position offset that happens to be >=44px', 'h-6 w-6 top-[44px]'],
    ['a width CAP, which bounds the box rather than sizing it', 'h-6 w-6 max-w-24'],
    ['a fraction width, which is a proportion of the parent', 'h-6 w-11/12'],
  ])('does not accept %s as sizing evidence', (_label, className) => {
    const src = `<button className="${className}"><XIcon /></button>`;
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
      { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
    ]);
  });

  it.each([
    ['a variant-prefixed sizing utility', 'sm:h-11 w-6'],
    ['an arbitrary sizing value on the min- form', 'min-h-[44px]'],
    ['a three-digit spacing step', 'size-100'],
  ])('still accepts %s', (_label, className) => {
    const src = `<button className="${className}"><XIcon /></button>`;
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
  });

  it('does not mistake a component tag for a raw element (case-sensitive)', () => {
    const src = [
      '<ButtonPrimitive onClick={onClick}>Save</ButtonPrimitive>',
      '<AliasTargetPicker onSelect={onSelect} />',
      '<article>content</article>',
    ].join('\n');
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
  });

  it('does not flag a raw element mentioned only in a comment or docstring', () => {
    const src = [
      '/**',
      ' * Match the `href` attribute on an `<a>` rendered by react-markdown.',
      ' */',
      '// falls through to a default <button> in that case',
      'export function noop() {}',
    ].join('\n');
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
  });

  it('reports the correct 1-indexed line for each match, not just the first', () => {
    const src = [
      'export function Toolbar() {',
      '  return (',
      '    <div>',
      '      <button type="button" onClick={a}>A</button>',
      '      <button type="button" onClick={b}>B</button>',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    const lines = findViolations('pillars/x/app/src/A.tsx', src).map((v) => v.line);
    expect(lines).toEqual([4, 5]);
  });
});

describe('isScannable', () => {
  it('scans a pillar app page', () => {
    expect(isScannable('pillars/food/app/src/pages/X.tsx')).toBe(true);
  });

  it('scans the shell', () => {
    expect(isScannable('pillars/shell/src/App.tsx')).toBe(true);
  });

  it('excludes a plain .ts file — JSX cannot appear there', () => {
    expect(isScannable('pillars/food/app/src/components/Helpers.ts')).toBe(false);
  });

  it('excludes stories, tests and specs', () => {
    expect(isScannable('pillars/food/app/src/pages/X.stories.tsx')).toBe(false);
    expect(isScannable('pillars/food/app/src/pages/X.test.tsx')).toBe(false);
    expect(isScannable('pillars/food/app/src/pages/X.spec.tsx')).toBe(false);
  });

  it('excludes __tests__, __mocks__ and e2e directories', () => {
    expect(isScannable('pillars/food/app/src/__tests__/x.tsx')).toBe(false);
    expect(isScannable('pillars/food/app/src/__mocks__/x.tsx')).toBe(false);
    expect(isScannable('pillars/shell/e2e/x.tsx')).toBe(false);
  });

  it('excludes a generated per-consumer client', () => {
    expect(isScannable('pillars/food/app/src/lists-api/types.gen.tsx')).toBe(false);
  });

  it('excludes a non-source file', () => {
    expect(isScannable('pillars/food/README.md')).toBe(false);
  });
});

describe('diffAgainstBaseline', () => {
  const baseline = {
    'pillars/food/app/src/a.tsx': { button: 2 },
    'pillars/shell/src/b.tsx': { a: 1 },
  };

  it('passes an unchanged tree', () => {
    expect(diffAgainstBaseline(baseline, baseline)).toEqual([]);
  });

  it('passes when violations shrink', () => {
    const shrunk = { 'pillars/food/app/src/a.tsx': { button: 1 } };
    expect(diffAgainstBaseline(shrunk, baseline)).toEqual([]);
  });

  it('flags a brand-new file carrying a violation', () => {
    const grown = { ...baseline, 'pillars/food/app/src/new.tsx': { button: 1 } };
    expect(diffAgainstBaseline(grown, baseline)).toContainEqual({
      file: 'pillars/food/app/src/new.tsx',
      kind: 'button',
      was: 0,
      now: 1,
    });
  });

  it('flags a new kind appearing in an already-baselined file', () => {
    const grown = {
      ...baseline,
      'pillars/shell/src/b.tsx': { a: 1, button: 1 },
    };
    expect(diffAgainstBaseline(grown, baseline)).toContainEqual({
      file: 'pillars/shell/src/b.tsx',
      kind: 'button',
      was: 0,
      now: 1,
    });
  });

  it('flags a grown count for an existing (file, kind)', () => {
    const grown = { ...baseline, 'pillars/food/app/src/a.tsx': { button: 3 } };
    expect(diffAgainstBaseline(grown, baseline)).toContainEqual({
      file: 'pillars/food/app/src/a.tsx',
      kind: 'button',
      was: 2,
      now: 3,
    });
  });
});
