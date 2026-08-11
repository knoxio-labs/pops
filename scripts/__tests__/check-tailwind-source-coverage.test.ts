import { describe, expect, it } from 'vitest';

import {
  evaluateCoverage,
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
