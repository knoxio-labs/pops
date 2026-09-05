import { describe, expect, it } from 'vitest';

import { countHatchesInText, diffAgainstBaseline } from '../check-escape-hatches.mjs';

describe('countHatchesInText', () => {
  it('counts each cast kind on real code lines', () => {
    const text = [
      'const a = x as any;',
      'const b = y as unknown as Foo;',
      'const c = z as never;',
      'const d = list as never[];',
    ].join('\n');
    expect(countHatchesInText(text)).toEqual({
      'as any': 1,
      'as unknown as': 1,
      'as never': 2,
    });
  });

  it('does NOT count casts that only appear in comments or docstrings', () => {
    const text = [
      '// avoid `as any` here',
      ' * the `as unknown as Message` cast that would imply',
      '/* never use as never */',
      'const real = v as any;',
    ].join('\n');
    expect(countHatchesInText(text)).toEqual({ 'as any': 1 });
  });

  it('counts eslint-disable directives (which live in comments)', () => {
    const text = [
      '// eslint-disable-next-line react-hooks/exhaustive-deps',
      'doThing();',
      '/* eslint-disable no-console */',
    ].join('\n');
    expect(countHatchesInText(text)).toEqual({ 'eslint-disable': 2 });
  });

  it('returns an empty object for clean code', () => {
    expect(countHatchesInText('const a: number = 1;\nexport default a;')).toEqual({});
  });

  it('does not mistake "as never" inside an identifier or string for a cast', () => {
    // `as` must be a standalone keyword; substrings like "phase as never" are real,
    // but "classNever" / "asNever" are not — \bas never\b guards the boundary.
    expect(countHatchesInText('const asNeverRan = true;')).toEqual({});
    expect(countHatchesInText('const x = phase as never;')).toEqual({ 'as never': 1 });
  });
});

/**
 * POPS-3019. `as unknown as T` was counted; the same defeat split over a wide
 * staging variable was not, and the inventory item write path spent three of
 * them while the gate reported "5 hatches, baseline 5, unchanged".
 *
 * These cases assert the reported COUNT, not that the gate exits zero — a
 * suite that only checked the latter would pass with both matchers deleted,
 * which is the exact failure ADR-045 names.
 */
describe('countHatchesInText — casts laundered through a wide staging variable', () => {
  it('counts the shape that motivated the ticket: staged, populated, asserted back', () => {
    const text = [
      'function nullableStringsFromInput(input: CreateInventoryItemInput): Partial<Insert> {',
      '  const out: Record<string, unknown> = {};',
      '  for (const key of CREATE_NULLABLE_STRING_KEYS) {',
      '    out[key] = input[key] ?? null;',
      '  }',
      '  return out as Partial<typeof homeInventory.$inferInsert>;',
      '}',
    ].join('\n');
    expect(countHatchesInText(text)).toEqual({ 'wide staging cast': 1 });
  });

  it('counts every assertion site, not merely the file, when one file stages twice', () => {
    // The pre-fix create-builder.ts carried this pair — two functions, both
    // naming their bag `out`. A per-file boolean would report 1 and let the
    // second cast be added for free.
    const text = [
      'function strings(input: In): Partial<Insert> {',
      '  const out: Record<string, unknown> = {};',
      '  out.brand = input.brand ?? null;',
      '  return out as Partial<Insert>;',
      '}',
      'function numbers(input: In): Partial<Insert> {',
      '  const out: Record<string, unknown> = {};',
      '  out.price = input.price ?? null;',
      '  return out as Partial<Insert>;',
      '}',
    ].join('\n');
    expect(countHatchesInText(text)).toEqual({ 'wide staging cast': 2 });
  });

  it('counts staging through `any`, `unknown` and `object`, not just Record', () => {
    for (const wide of ['any', 'unknown', 'object', 'Record<PropertyKey, any>']) {
      const text = `const acc: ${wide} = {};\nacc.total = 1;\nexport default acc as Totals;`;
      expect(countHatchesInText(text)).toEqual({ 'wide staging cast': 1 });
    }
  });

  it('counts a bag seeded by a literal even with no later property write', () => {
    const text = 'const values: Record<string, unknown> = { id, title };\nreturn values as Insert;';
    expect(countHatchesInText(text)).toEqual({ 'wide staging cast': 1 });
  });

  it('counts the inline sibling that widens at the point of writing', () => {
    const text = [
      'const updates: InventoryUpdate = {};',
      'for (const key of keys) {',
      '  (updates as Record<string, unknown>)[key] = value ?? null;',
      '}',
    ].join('\n');
    expect(countHatchesInText(text)).toEqual({ 'wide write-through cast': 1 });
  });

  it('does not double-charge a cast an existing single-line kind already counts', () => {
    // `out as unknown as Foo` is one cast. Counting it as both "as unknown as"
    // and "wide staging cast" would make removing it look like a two-hatch win
    // and let a fresh hatch land under the slack.
    const text =
      'const out: Record<string, unknown> = {};\nout.k = 1;\nreturn out as unknown as Foo;';
    expect(countHatchesInText(text)).toEqual({ 'as unknown as': 1 });

    const viaAny = 'const out: any = {};\nout.k = 1;\nreturn out as any;';
    expect(countHatchesInText(viaAny)).toEqual({ 'as any': 1 });
  });
});

/**
 * The precision half. A matcher that flags every `Record<string, unknown>`
 * would fire on genuinely dynamic data, JSON boundaries and parsed input —
 * and a guard people learn to ignore is worse than no guard. Every case here
 * RECEIVES a wide value rather than building one, which is the line the
 * matcher draws.
 */
describe('countHatchesInText — legitimate wide-type uses that must stay uncounted', () => {
  it('ignores a JSON boundary narrowed once and never populated', () => {
    const text = [
      'const parsed: unknown = JSON.parse(await res.text());',
      'return parsed as ImportManifest;',
    ].join('\n');
    expect(countHatchesInText(text)).toEqual({});
  });

  it('ignores a wide bag that is returned as itself', () => {
    const text = [
      'const meta: Record<string, unknown> = {};',
      'meta.traceId = id;',
      'meta.startedAt = now;',
      'return meta;',
    ].join('\n');
    expect(countHatchesInText(text)).toEqual({});
  });

  it('ignores a genuinely dynamic parameter and an index-signature alias', () => {
    expect(
      countHatchesInText(
        'export function shape(input: Record<string, unknown>): string[] {\n  return Object.keys(input).toSorted();\n}'
      )
    ).toEqual({});
    expect(
      countHatchesInText('type Json = Record<string, unknown>;\nconst x = payload as Json;')
    ).toEqual({});
  });

  it('ignores `as const`, which narrows rather than launders', () => {
    const text =
      'const flags: Record<string, unknown> = {};\nflags.beta = true;\nreturn flags as const;';
    expect(countHatchesInText(text)).toEqual({});
  });

  it('binds the assertion to the staged identifier, not to any assertion in the file', () => {
    const text = [
      'const bag: Record<string, unknown> = {};',
      'bag.k = 1;',
      'sink(bag);',
      'return response as ImportSummary;',
    ].join('\n');
    expect(countHatchesInText(text)).toEqual({});
  });

  it('does not treat an identifier that merely contains the staged name as the staged one', () => {
    const text = 'const bag: Record<string, unknown> = {};\nbag.k = 1;\nreturn bagged as Config;';
    expect(countHatchesInText(text)).toEqual({});

    const prefixed =
      'const bag: Record<string, unknown> = {};\nbag.k = 1;\nreturn myBag as Config;';
    expect(countHatchesInText(prefixed)).toEqual({});
  });

  it('does not read a comparison or an unknown-probe as populating the bag', () => {
    // `probe.kind === 'a'` is a read. Treating `===` as a write would fire on
    // every narrowing guard in the repo.
    const text = 'const probe: unknown = read();\nif (probe.kind === "a") return probe as Node;';
    expect(countHatchesInText(text)).toEqual({});

    const notEqual =
      'const probe: unknown = read();\nif (probe.kind !== "a") return probe as Node;';
    expect(countHatchesInText(notEqual)).toEqual({});
  });

  it('does not read the pattern shown inside a docstring as code', () => {
    const text = [
      '/**',
      ' * Do not write:',
      ' *   const out: Record<string, unknown> = {};',
      ' *   out.k = 1;',
      ' *   return out as Foo;',
      ' */',
      'export const documented = 1;',
    ].join('\n');
    expect(countHatchesInText(text)).toEqual({});
  });

  it('does not count a read through a widening cast — only a write through one', () => {
    const text = 'const seg = (current as Record<string, unknown>)[key];';
    expect(countHatchesInText(text)).toEqual({});
  });
});

describe('diffAgainstBaseline', () => {
  const baseline = {
    'pillars/finance/app/src/a.tsx': { 'as never': 2 },
    'libs/ui/src/b.ts': { 'eslint-disable': 1 },
  };

  it('passes an unchanged tree', () => {
    expect(diffAgainstBaseline(baseline, baseline)).toEqual([]);
  });

  it('passes when hatches shrink', () => {
    const shrunk = {
      'pillars/finance/app/src/a.tsx': { 'as never': 1 },
    };
    expect(diffAgainstBaseline(shrunk, baseline)).toEqual([]);
  });

  it('flags a brand-new file carrying a hatch', () => {
    const grown = { ...baseline, 'pillars/new/c.ts': { 'as any': 1 } };
    expect(diffAgainstBaseline(grown, baseline)).toContainEqual({
      file: 'pillars/new/c.ts',
      kind: 'as any',
      was: 0,
      now: 1,
    });
  });

  it('flags a new kind appearing in an already-baselined file', () => {
    const grown = {
      ...baseline,
      'libs/ui/src/b.ts': { 'eslint-disable': 1, 'as unknown as': 1 },
    };
    expect(diffAgainstBaseline(grown, baseline)).toContainEqual({
      file: 'libs/ui/src/b.ts',
      kind: 'as unknown as',
      was: 0,
      now: 1,
    });
  });

  it('flags a grown count for an existing (file, kind)', () => {
    const grown = { ...baseline, 'pillars/finance/app/src/a.tsx': { 'as never': 3 } };
    expect(diffAgainstBaseline(grown, baseline)).toContainEqual({
      file: 'pillars/finance/app/src/a.tsx',
      kind: 'as never',
      was: 2,
      now: 3,
    });
  });
});
