import { describe, expect, it } from 'vitest';

import {
  absoluteSourceGlob,
  collectEntrySources,
  evaluateCoverage,
  evaluateRemoteStylesheet,
  evaluateShellSheet,
  globBaseDir,
  globToRegExp,
  parseSourceStatements,
  partitionStatements,
  stripComments,
  tokensDetectAutomatically,
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

  it('a positive class that explicitly lists `/` still refuses to cross a path segment', () => {
    // A bracket class is a single-character match; without this guard,
    // `[/]` (or any class listing `/` among its members) would match a
    // literal path separator, unlike every other construct in this
    // compiler (`*`, `?`, negated classes) which all stay within one
    // segment.
    const re = globToRegExp('/r/x/[a/]/y');
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

describe('stripComments', () => {
  it('removes a comment that mentions @source, so it is not read as a statement', () => {
    const css = '/* No `@source` here: see index.css. */\n@import "tailwindcss";\n';
    expect(parseSourceStatements(css)).toEqual([]);
  });

  it('leaves comment-shaped text inside a quoted glob alone', () => {
    const css = '@source "../../../../libs/**/src/**/*.{ts,tsx}";';
    expect(stripComments(css)).toBe(css);
    expect(parseSourceStatements(css)[0]?.arg).toBe('../../../../libs/**/src/**/*.{ts,tsx}');
  });

  it('drops an unterminated comment to the end rather than keeping it', () => {
    expect(stripComments('a /* never closed @source "x";')).toBe('a ');
  });
});

describe('absoluteSourceGlob', () => {
  it('reads a path with no metacharacter as a directory scanned recursively', () => {
    const glob = absoluteSourceGlob('/r/pillars/x/app', './src');
    expect(glob).toBe('/r/pillars/x/app/src/**/*');
    expect(globToRegExp(glob).test('/r/pillars/x/app/src/pages/deep/Page.tsx')).toBe(true);
    expect(globToRegExp(glob).test('/r/pillars/x/app/Outside.tsx')).toBe(false);
  });

  it('keeps a glob as a glob, resolved against the declaring file', () => {
    expect(absoluteSourceGlob('/r/pillars/design/src', '../../*/app/src/**/*.tsx')).toBe(
      '/r/pillars/*/app/src/**/*.tsx'
    );
  });
});

describe('collectEntrySources', () => {
  const tree = new Map([
    ['/r/pillars/shell/src/styles.css', "@import '@pops/ui/theme';\n@source '.';\n"],
    ['/r/libs/ui/src/theme/index.css', "@import './globals.css';\n@source '../../../../libs';\n"],
    ['/r/libs/ui/src/theme/globals.css', "@import 'tailwindcss';\n"],
  ]);
  const edges = (specifier: string, fromDir: string): string | undefined => {
    if (specifier === '@pops/ui/theme') return '/r/libs/ui/src/theme/index.css';
    if (specifier.startsWith('.')) return `${fromDir}/${specifier.slice(2)}`;
    return undefined;
  };

  it('follows @import through the package theme and collects every scan, with its glob', () => {
    const { sources, missing } = collectEntrySources(
      '/r/pillars/shell/src/styles.css',
      (path: string) => tree.get(path),
      edges
    );
    expect(missing).toEqual([]);
    expect(sources.map((s: { glob?: string }) => s.glob)).toEqual([
      '/r/pillars/shell/src/**/*',
      '/r/libs/**/*',
    ]);
  });

  it('follows @reference too — Tailwind honours @source in a referenced file', () => {
    const leaky = new Map([
      ['/r/pillars/x/app/remote.css', "@reference '../../../libs/ui/src/theme/globals.css';\n"],
      ['/r/libs/ui/src/theme/globals.css', "@source '../../../../libs';\n"],
    ]);
    const resolveRelative = (specifier: string, fromDir: string) =>
      specifier.startsWith('.') ? `${fromDir}/${specifier}` : undefined;
    const { sources } = collectEntrySources(
      '/r/pillars/x/app/remote.css',
      (path: string) => leaky.get(path.replace('/r/pillars/x/app/../../../', '/r/')),
      resolveRelative
    );
    expect(sources).toHaveLength(1);
  });

  it('reports an entry that does not exist rather than returning no sources silently', () => {
    const { sources, missing } = collectEntrySources('/r/nowhere.css', () => undefined, edges);
    expect(sources).toEqual([]);
    expect(missing).toEqual(['/r/nowhere.css']);
  });

  it('does not loop on a cycle', () => {
    const cyclic = new Map([
      ['/r/a.css', "@import './b.css';\n@source './src';\n"],
      ['/r/b.css', "@import './a.css';\n"],
    ]);
    const { sources } = collectEntrySources('/r/a.css', (p: string) => cyclic.get(p), edges);
    expect(sources).toHaveLength(1);
  });
});

describe('evaluateShellSheet', () => {
  const files = [
    { path: '/r/libs/ui/src/Button.tsx', ext: '.tsx', hasClassName: true },
    { path: '/r/pillars/shell/src/App.tsx', ext: '.tsx', hasClassName: true },
    { path: '/r/pillars/finance/app/src/Page.tsx', ext: '.tsx', hasClassName: true },
  ];
  const libsAndShell = ['/r/libs/**/src/**/*.{ts,tsx}', '/r/pillars/shell/src/**/*'];

  it('passes a sheet over libs and the shell alone', () => {
    expect(evaluateShellSheet(libsAndShell, files, '/r')).toEqual({
      reachesPillars: [],
      uncovered: [],
    });
  });

  it('flags a sheet that still scans pillars/** — the coupling POPS-4581 removed', () => {
    const result = evaluateShellSheet(
      [...libsAndShell, '/r/pillars/**/src/**/*.{ts,tsx}'],
      files,
      '/r'
    );
    expect(result.reachesPillars).toEqual(['/r/pillars/finance/app/src/Page.tsx']);
  });

  it('flags a sheet that stopped scanning the shell', () => {
    const result = evaluateShellSheet(['/r/libs/**/src/**/*.{ts,tsx}'], files, '/r');
    expect(result.uncovered).toEqual(['/r/pillars/shell/src/App.tsx']);
  });

  it('flags a sheet that stopped scanning the libs', () => {
    const result = evaluateShellSheet(['/r/pillars/shell/src/**/*'], files, '/r');
    expect(result.uncovered).toEqual(['/r/libs/ui/src/Button.tsx']);
  });
});

describe('evaluateRemoteStylesheet', () => {
  const appDir = '/r/pillars/x/app';
  const files = [{ path: `${appDir}/src/Page.tsx`, ext: '.tsx', hasClassName: true }];
  const css = [
    "@reference '@pops/ui/theme/globals.css';",
    "@import 'tailwindcss/utilities' layer(utilities) source(none);",
    "@source './src';",
  ].join('\n');
  const absGlobs = [`${appDir}/src/**/*`];
  const evaluate = (overrides: Record<string, unknown> = {}) =>
    evaluateRemoteStylesheet({ appDir, css, absGlobs, files, ...overrides });

  it('passes the recipe every pillar app uses', () => {
    expect(evaluate()).toEqual([]);
  });

  it('flags a remote build with no stylesheet entry at all', () => {
    expect(evaluate({ css: undefined })).toEqual([
      'no remote.css — the remote build emits no stylesheet of its own',
    ]);
  });

  it('flags a sheet that leaves automatic detection on', () => {
    const problems = evaluate({ css: css.replace(' source(none)', '') });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('source(none)');
  });

  it('flags a sheet whose utilities are unlayered', () => {
    const problems = evaluate({ css: css.replace(' layer(utilities)', '') });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('layer(utilities)');
  });

  it('flags a sheet that imports the tokens instead of referencing them', () => {
    const problems = evaluate({ css: css.replace('@reference', '@import') });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('@reference');
  });

  it('flags a sheet that does not import the utilities at all', () => {
    const problems = evaluate({ css: css.replace(/@import[^\n]*\n/, '') });
    expect(problems).toEqual(["remote.css does not import 'tailwindcss/utilities'"]);
  });

  it('flags a scan reaching outside the app, such as into the libs', () => {
    const problems = evaluate({ absGlobs: [...absGlobs, '/r/libs/**/*'] });
    expect(problems).toEqual(['remote.css scans outside the app: /r/libs/**/*']);
  });

  it('flags a sheet that scans nothing, and the app source it then misses', () => {
    expect(evaluate({ absGlobs: [] })).toEqual([
      'remote.css scans nothing',
      `remote.css does not scan ${appDir}/src/Page.tsx`,
    ]);
  });
});

describe('tokensDetectAutomatically', () => {
  it('flags a tailwindcss import that leaves automatic detection on', () => {
    expect(tokensDetectAutomatically("@import 'tailwindcss';")).toBe(true);
  });

  it('passes one with source(none), and ignores other imports', () => {
    expect(
      tokensDetectAutomatically("@import 'tailwindcss' source(none);\n@import 'tw-animate-css';")
    ).toBe(false);
  });

  it('does not read an import in a comment', () => {
    expect(tokensDetectAutomatically("/* @import 'tailwindcss'; */")).toBe(false);
  });
});
