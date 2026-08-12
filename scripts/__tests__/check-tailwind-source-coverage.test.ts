import { describe, expect, it } from 'vitest';

import {
  evaluateCoverage,
  globBaseDir,
  globToRegExp,
  parseSourceStatements,
  partitionStatements,
} from '../check-tailwind-source-coverage.mjs';

describe('parseSourceStatements', () => {
  it('parses a plain quoted glob as kind "source"', () => {
    const css = '@source "../../../../pillars/**/src/**/*.{ts,tsx}";';
    expect(parseSourceStatements(css)).toEqual([
      {
        kind: 'source',
        raw: css,
        arg: '../../../../pillars/**/src/**/*.{ts,tsx}',
      },
    ]);
  });

  it('parses every plain statement across multiple lines', () => {
    const css = [
      '@source "../../../../pillars/**/src/**/*.{ts,tsx}";',
      '@source "../../../../libs/**/src/**/*.{ts,tsx}";',
    ].join('\n');
    const statements = parseSourceStatements(css);
    expect(statements).toHaveLength(2);
    expect(statements.every((s) => s.kind === 'source')).toBe(true);
  });

  it('does not silently drop `@source not "…"` — the bug this guard fixes', () => {
    const css = '@source not "../../../../legacy/**/*.ts";';
    const statements = parseSourceStatements(css);
    // The old regex required a quote immediately after `@source`; `not` sat
    // there instead and the statement vanished with zero matches. It must
    // now be captured, even though it is later banned by partitionStatements.
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatchObject({
      kind: 'not',
      arg: '../../../../legacy/**/*.ts',
    });
  });

  it('does not silently drop `@source inline("…")` — the other bug this guard fixes', () => {
    const css = '@source inline("bg-red-{50,100,900}");';
    const statements = parseSourceStatements(css);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatchObject({
      kind: 'inline',
      arg: 'bg-red-{50,100,900}',
    });
  });

  it('classifies an @source shape it cannot parse as "unrecognized" rather than dropping it', () => {
    const css = '@source url("weird.css");';
    const statements = parseSourceStatements(css);
    expect(statements).toHaveLength(1);
    expect(statements[0]?.kind).toBe('unrecognized');
    expect(statements[0]?.raw).toBe(css);
  });

  it('classifies a bare @source with no argument as "unrecognized"', () => {
    const css = '@source ;';
    const statements = parseSourceStatements(css);
    expect(statements).toHaveLength(1);
    expect(statements[0]?.kind).toBe('unrecognized');
  });

  it('returns an empty array when there are no @source statements at all', () => {
    expect(parseSourceStatements('body { color: red; }')).toEqual([]);
  });
});

describe('partitionStatements', () => {
  it('splits plain globs into sourceGlobs and reports no violations', () => {
    const statements = parseSourceStatements(
      [
        '@source "../../../../pillars/**/src/**/*.{ts,tsx}";',
        '@source "../../../../libs/**/src/**/*.{ts,tsx}";',
      ].join('\n')
    );
    const { sourceGlobs, inlineStatements, violations } = partitionStatements(statements);
    expect(sourceGlobs).toEqual([
      '../../../../pillars/**/src/**/*.{ts,tsx}',
      '../../../../libs/**/src/**/*.{ts,tsx}',
    ]);
    expect(inlineStatements).toEqual([]);
    expect(violations).toEqual([]);
  });

  it('treats `@source not` as a violation, not a usable glob', () => {
    const statements = parseSourceStatements(
      [
        '@source "../../../../pillars/**/src/**/*.{ts,tsx}";',
        '@source not "../../../../legacy/**/*.ts";',
      ].join('\n')
    );
    const { sourceGlobs, violations } = partitionStatements(statements);
    expect(sourceGlobs).toEqual(['../../../../pillars/**/src/**/*.{ts,tsx}']);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.kind).toBe('not');
  });

  it('accepts `@source inline(...)` without treating it as a scanned glob', () => {
    const statements = parseSourceStatements(
      [
        '@source "../../../../pillars/**/src/**/*.{ts,tsx}";',
        '@source inline("bg-red-{50,100,900}");',
      ].join('\n')
    );
    const { sourceGlobs, inlineStatements, violations } = partitionStatements(statements);
    expect(sourceGlobs).toEqual(['../../../../pillars/**/src/**/*.{ts,tsx}']);
    expect(inlineStatements).toHaveLength(1);
    expect(violations).toEqual([]);
  });

  it('reports an unrecognized statement as a violation', () => {
    const statements = parseSourceStatements('@source url("weird.css");');
    const { violations } = partitionStatements(statements);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.kind).toBe('unrecognized');
  });
});

describe('globToRegExp — brace glob', () => {
  it('expands a trailing extension brace list to match every listed extension', () => {
    const re = globToRegExp('/r/pillars/**/src/**/*.{ts,tsx}');
    expect(re.test('/r/pillars/finance/app/src/Dashboard.ts')).toBe(true);
    expect(re.test('/r/pillars/finance/app/src/Dashboard.tsx')).toBe(true);
    expect(re.test('/r/pillars/finance/app/src/Dashboard.jsx')).toBe(false);
  });

  it('expands a mid-path brace list to alternate whole segments', () => {
    const re = globToRegExp('/r/{pillars,libs}/*/src/index.ts');
    expect(re.test('/r/pillars/finance/src/index.ts')).toBe(true);
    expect(re.test('/r/libs/ui/src/index.ts')).toBe(true);
    expect(re.test('/r/apps/finance/src/index.ts')).toBe(false);
  });
});

describe('globToRegExp — bracket character class (POPS-1788)', () => {
  it('matches any single listed character', () => {
    const re = globToRegExp('/r/pillars/[fmi]inance/src/index.ts');
    expect(re.test('/r/pillars/finance/src/index.ts')).toBe(true);
    expect(re.test('/r/pillars/minance/src/index.ts')).toBe(true);
    expect(re.test('/r/pillars/xinance/src/index.ts')).toBe(false);
  });

  it('matches a range', () => {
    const re = globToRegExp('/r/pillars/[a-z]*/src/index.ts');
    expect(re.test('/r/pillars/finance/src/index.ts')).toBe(true);
    expect(re.test('/r/pillars/Finance/src/index.ts')).toBe(false);
  });

  it('matches a multi-range plus explicit member, e.g. [a-zA-Z_]', () => {
    const re = globToRegExp('/r/pillars/[a-zA-Z_]*/src/index.ts');
    expect(re.test('/r/pillars/finance/src/index.ts')).toBe(true);
    expect(re.test('/r/pillars/Finance/src/index.ts')).toBe(true);
    expect(re.test('/r/pillars/_private/src/index.ts')).toBe(true);
    expect(re.test('/r/pillars/9finance/src/index.ts')).toBe(false);
  });

  it('negates with `[!…]`', () => {
    const re = globToRegExp('/r/pillars/[!Z]*/src/index.ts');
    expect(re.test('/r/pillars/finance/src/index.ts')).toBe(true);
    expect(re.test('/r/pillars/Zeta/src/index.ts')).toBe(false);
  });

  it('negates with `[^…]` identically to `[!…]`', () => {
    const bang = globToRegExp('/r/pillars/[!Z]*/src/index.ts');
    const caret = globToRegExp('/r/pillars/[^Z]*/src/index.ts');
    for (const p of ['/r/pillars/finance/src/index.ts', '/r/pillars/Zeta/src/index.ts']) {
      expect(caret.test(p)).toBe(bang.test(p));
    }
  });

  it('a negated class still refuses to cross a path segment', () => {
    // Folding `/` into the negated set as text risks an unintended range
    // (a trailing `-` in the class body followed by `/` reads as a range);
    // this proves the `/` exclusion holds regardless, matching how `*` and
    // `?` already refuse to cross a segment boundary.
    const re = globToRegExp('/r/x/[!Z]/y');
    expect(re.test('/r/x/a/y')).toBe(true);
    expect(re.test('/r/x//y')).toBe(false);
  });

  it('a negated class built from a trailing-hyphen body does not form a bogus range', () => {
    // Content `a-` ends in a hyphen; naively appending `/` (`[^a-/]`) would
    // read as the range hyphen-through-slash. The lookahead-based negation
    // never concatenates `/` into the class body, so this stays correct.
    const re = globToRegExp('/r/pillars/[!a-]/src/index.ts');
    expect(re.test('/r/pillars/-/src/index.ts')).toBe(false);
    expect(re.test('/r/pillars/z/src/index.ts')).toBe(true);
  });

  it('treats a `]` immediately after `[` (or after negation) as a literal member', () => {
    const re = globToRegExp('/r/[]a]bc');
    expect(re.test('/r/]bc')).toBe(true);
    expect(re.test('/r/abc')).toBe(true);
    expect(re.test('/r/xbc')).toBe(false);

    const negated = globToRegExp('/r/[!]a]bc');
    expect(negated.test('/r/]bc')).toBe(false);
    expect(negated.test('/r/abc')).toBe(false);
    expect(negated.test('/r/xbc')).toBe(true);
  });

  it('falls back to a literal `[` when no closing `]` exists', () => {
    const re = globToRegExp('/r/[abc');
    expect(re.test('/r/[abc')).toBe(true);
    expect(re.test('/r/abc')).toBe(false);
  });

  it('escapes a literal backslash inside the class body', () => {
    const re = globToRegExp('/r/pillars/[a\\]/src/index.ts'); // runtime glob: [a\] — 'a' or one literal backslash
    expect(re.test('/r/pillars/a/src/index.ts')).toBe(true);
    expect(re.test('/r/pillars/\\/src/index.ts')).toBe(true); // path with a single literal backslash char
    expect(re.test('/r/pillars/b/src/index.ts')).toBe(false);
  });

  it('a bracket-class glob that matches nothing reports as empty, not as a compile failure', () => {
    // This is the POPS-1788 "fails safe" scenario the ticket describes: even
    // before this fix, an unsatisfiable bracket glob was caught by the
    // empty-glob check rather than silently ignored. After the fix, a glob
    // that is well-formed but genuinely matches no indexed file still
    // reports empty — the change is that a glob which SHOULD match now does.
    const files = [{ path: '/r/pillars/finance/src/index.ts', ext: '.ts', hasClassName: false }];
    const { emptyGlobs } = evaluateCoverage(['/r/pillars/[0-9]*/src/index.ts'], files);
    expect(emptyGlobs).toEqual(['/r/pillars/[0-9]*/src/index.ts']);
  });

  it('a bracket-class glob that should match real files now does', () => {
    const files = [
      { path: '/r/pillars/finance/src/index.ts', ext: '.ts', hasClassName: false },
      { path: '/r/pillars/Zeta/src/index.ts', ext: '.ts', hasClassName: false },
    ];
    const { emptyGlobs } = evaluateCoverage(['/r/pillars/[a-z]*/src/index.ts'], files);
    expect(emptyGlobs).toEqual([]);
  });
});

describe('globBaseDir — bracket class as a metacharacter (POPS-1788)', () => {
  it('stops at a bracket class that opens before any other wildcard', () => {
    // Before this fix, only `*`/`?`/`{` counted as metacharacters, so this
    // glob's prefix kept the literal `[a-z]pillars` text — a directory that
    // can never exist on disk, so `walk()` would find nothing under it and
    // the glob would report empty regardless of what it should match.
    expect(globBaseDir('/r/[a-z]pillars/src/**/*.ts')).toBe('/r');
  });

  it('stops at a bracket class that opens mid-segment, after a literal prefix', () => {
    expect(globBaseDir('/r/pillars/[a-z]*/src/**/*.ts')).toBe('/r/pillars');
  });

  it('still stops at the earliest of `*`, `?`, `{`, or `[`, whichever comes first', () => {
    expect(globBaseDir('/r/pillars/*/[a-z]/src/index.ts')).toBe('/r/pillars');
    expect(globBaseDir('/r/pillars/{a,b}/[c-d]/src/index.ts')).toBe('/r/pillars');
  });

  it('falls back to the full literal path when there is no metacharacter at all', () => {
    expect(globBaseDir('/r/pillars/finance/src/index.ts')).toBe('/r/pillars/finance/src');
  });
});

describe('evaluateCoverage', () => {
  it('flags a glob that matches nothing in the indexed file set', () => {
    const files = [
      { path: '/r/pillars/finance/app/src/Dashboard.tsx', ext: '.tsx', hasClassName: true },
    ];
    const { emptyGlobs, uncovered } = evaluateCoverage(['/r/apps/*/src/**/*.{ts,tsx}'], files);
    expect(emptyGlobs).toEqual(['/r/apps/*/src/**/*.{ts,tsx}']);
    expect(uncovered).toEqual(['/r/pillars/finance/app/src/Dashboard.tsx']);
  });

  it('passes when every className-bearing file is matched by some glob', () => {
    const files = [
      { path: '/r/pillars/finance/app/src/Dashboard.tsx', ext: '.tsx', hasClassName: true },
    ];
    const { emptyGlobs, uncovered } = evaluateCoverage(['/r/pillars/**/src/**/*.{ts,tsx}'], files);
    expect(emptyGlobs).toEqual([]);
    expect(uncovered).toEqual([]);
  });
});
