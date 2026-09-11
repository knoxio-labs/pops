import { globSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { storyGlobs } from '../../.storybook/story-globs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STORYBOOK_DIR = resolve(HERE, '../../.storybook');

interface DocumentedGlob {
  pattern: string;
  isExcluded: (matchedRelativePath: string) => boolean;
}

const WHOLE_SEGMENT_NEGATION = /^!\(([^|)]+)\)$/;
const ALTERNATION_GROUP = /@\(([^)]+)\)/g;
const UNSUPPORTED_EXTGLOB = /[?+*!]\(/;

/**
 * `main.ts` passes `storyGlobs` straight to Storybook, which resolves them
 * with picomatch (documents extglob). `fs.globSync` only documents `*`,
 * `**`, `?`, `[...]` and `{...}` — it happens to also resolve `@(...)` and
 * `!(...)` today, but that's unspecified behaviour this test shouldn't rely
 * on. This translates the two extglob forms `story-globs.ts` actually uses
 * into documented syntax, and throws on anything else so a future
 * specifier can't silently mistranslate.
 */
function toDocumentedGlob(spec: string): DocumentedGlob {
  let exclusion: { segmentIndex: number; excluded: string } | undefined;

  const segments = spec.split('/').map((segment, segmentIndex) => {
    const wholeSegmentNegation = WHOLE_SEGMENT_NEGATION.exec(segment);
    if (wholeSegmentNegation) {
      if (exclusion) {
        throw new Error(
          `unsupported glob "${spec}": more than one "!(...)" segment is not supported`
        );
      }
      exclusion = { segmentIndex, excluded: wholeSegmentNegation[1]! };
      return '*';
    }

    const translated = segment.replace(
      ALTERNATION_GROUP,
      (_match, alternatives: string) => `{${alternatives.split('|').join(',')}}`
    );

    if (UNSUPPORTED_EXTGLOB.test(translated)) {
      throw new Error(`unsupported extglob syntax in "${spec}": segment "${segment}"`);
    }

    return translated;
  });

  const pattern = segments.join('/');
  const isExcluded = exclusion
    ? (matchedRelativePath: string) =>
        matchedRelativePath.split('/')[exclusion!.segmentIndex] === exclusion!.excluded
    : () => false;

  return { pattern, isExcluded };
}

/**
 * `main.ts` and this test both import `storyGlobs` — there is exactly one
 * list of specifiers, and this expands it exactly the way Storybook does:
 * each entry resolved relative to `.storybook/`, the config's own directory.
 * Two different specifiers can list the same file under two different
 * relative spellings (e.g. `../src/x.tsx` vs `../../ui/src/x.tsx`), so every
 * match is resolved to an absolute path up front.
 */
function matchesPerSpecifier(): string[][] {
  return storyGlobs.map((spec) => {
    const { pattern, isExcluded } = toDocumentedGlob(spec);
    return globSync(pattern, { cwd: STORYBOOK_DIR })
      .filter((file) => !isExcluded(file))
      .map((file) => resolve(STORYBOOK_DIR, file));
  });
}

/**
 * Finds the one `storyGlobs` entry a predicate identifies, by index into the
 * shared array — so the tests below reason about "the own-stories specifier"
 * etc. without retyping any glob literal that already lives in
 * `story-globs.ts`.
 */
function findSpecifierIndex(predicate: (spec: string) => boolean): number {
  const indices = storyGlobs.reduce<number[]>(
    (acc, spec, index) => (predicate(spec) ? [...acc, index] : acc),
    []
  );
  expect(
    indices,
    `expected exactly one storyGlobs entry to match, found indices: ${indices.join(', ')}`
  ).toHaveLength(1);
  return indices[0]!;
}

const isOwnStoriesSpecifier = (spec: string): boolean =>
  spec.startsWith('../src/') && spec.includes('.stories.');
const isPillarsSpecifier = (spec: string): boolean => spec.includes('/pillars/');
const isSiblingLibSpecifier = (spec: string): boolean => spec.includes('!(ui)');

/**
 * No sibling lib has stories yet, so the sibling-lib specifier legitimately
 * matches zero files today — that can't exercise its "!(ui)" exclusion.
 * Swaps the story-file tail for `package.json`, which every lib has, so the
 * exclusion is checked against matches that actually exist.
 */
function toLibLevelPattern(spec: string): string {
  const pattern = spec.replace(/src\/\*\*\/\*\.stories\.@\([^)]*\)$/, 'package.json');
  if (pattern === spec) {
    throw new Error(`could not derive a lib-level pattern from "${spec}"`);
  }
  return pattern;
}

describe('toDocumentedGlob', () => {
  it('turns a shared @(...) alternation into the documented brace form', () => {
    expect(toDocumentedGlob('@(ts|tsx)').pattern).toBe('{ts,tsx}');
  });

  it('turns a whole-segment !(...) into * plus a positional exclusion', () => {
    const { pattern, isExcluded } = toDocumentedGlob('../../!(ui)/src/x');

    expect(pattern).toBe('../../*/src/x');
    expect(isExcluded('../../ui/src/x')).toBe(true);
    expect(isExcluded('../../date/src/x')).toBe(false);
  });

  it('throws on unsupported extglob forms', () => {
    expect(() => toDocumentedGlob('?(x)')).toThrow();
    expect(() => toDocumentedGlob('+(x)')).toThrow();
    expect(() => toDocumentedGlob('*(x)')).toThrow();
    expect(() => toDocumentedGlob('prefix!(x)suffix')).toThrow();
  });
});

describe('storybook stories globs', () => {
  it('never hands fs.globSync raw extglob syntax', () => {
    for (const spec of storyGlobs) {
      const { pattern } = toDocumentedGlob(spec);
      expect(
        pattern,
        `translated "${spec}" to "${pattern}", which still contains "@("`
      ).not.toContain('@(');
      expect(
        pattern,
        `translated "${spec}" to "${pattern}", which still contains "!("`
      ).not.toContain('!(');
    }
  });

  it('matches every story/mdx file with exactly one specifier', () => {
    const perSpecifier = matchesPerSpecifier();
    const countByFile = new Map<string, number>();
    for (const matches of perSpecifier) {
      for (const file of matches) {
        countByFile.set(file, (countByFile.get(file) ?? 0) + 1);
      }
    }

    expect(countByFile.size).toBeGreaterThan(0);

    const doubleMatched = [...countByFile.entries()].filter(([, count]) => count > 1);
    expect(
      doubleMatched,
      `these files are matched by more than one "stories" specifier — a specifier glob ` +
        `is too broad (e.g. it also matches libs/ui's own src): ${doubleMatched
          .map(([file, count]) => `${file} (x${count})`)
          .join(', ')}`
    ).toEqual([]);
  });

  it('resolves each populated specifier to at least one file on its own', () => {
    const perSpecifier = matchesPerSpecifier();
    const ownIndex = findSpecifierIndex(isOwnStoriesSpecifier);
    const pillarsIndex = findSpecifierIndex(isPillarsSpecifier);

    // The sibling-lib specifier is deliberately not asserted non-empty here:
    // no sibling lib has stories today, so it legitimately matches nothing.
    expect(
      perSpecifier[ownIndex]!.length,
      `own-stories specifier "${storyGlobs[ownIndex]}" matched no files — its "@(...)" extglob may not be resolving`
    ).toBeGreaterThan(0);
    expect(
      perSpecifier[pillarsIndex]!.length,
      `pillars specifier "${storyGlobs[pillarsIndex]}" matched no files — its "@(...)" extglob may not be resolving`
    ).toBeGreaterThan(0);
  });

  it('excludes libs/ui from the sibling-lib specifier', () => {
    const siblingIndex = findSpecifierIndex(isSiblingLibSpecifier);
    const siblingSpec = storyGlobs[siblingIndex]!;
    const libLevelSpec = toLibLevelPattern(siblingSpec);
    const { pattern, isExcluded } = toDocumentedGlob(libLevelSpec);

    const rawMatches = globSync(pattern, { cwd: STORYBOOK_DIR });

    expect(
      rawMatches.length,
      `"${pattern}" matched no files — the "*" substituted for "!(ui)" may not be resolving at all`
    ).toBeGreaterThan(0);
    expect(
      rawMatches.some((file) => isExcluded(file)),
      `none of the raw matches for "${pattern}" were recognised as "ui" — the exclusion's segment index may be wrong: ${rawMatches.join(', ')}`
    ).toBe(true);

    const matches = rawMatches
      .filter((file) => !isExcluded(file))
      .map((file) => resolve(STORYBOOK_DIR, file));
    expect(
      matches.some((file) => file.includes(`${sep}libs${sep}ui${sep}`)),
      `"${pattern}" matched a file under libs/ui after filtering, so the exclusion predicate isn't excluding it: ${matches.join(', ')}`
    ).toBe(false);
  });

  it('gives every story file with an explicit CSF title a unique title (auto-titled files are skipped)', () => {
    const storyFiles = [
      ...new Set(
        matchesPerSpecifier()
          .flat()
          .filter((file) => /\.stories\.(js|jsx|mjs|ts|tsx)$/.test(file))
      ),
    ];

    const filesByTitle = new Map<string, string[]>();
    for (const file of storyFiles) {
      const source = readFileSync(file, 'utf8');
      const match = /title:\s*['"]([^'"]+)['"]/.exec(source);
      const title = match?.[1];
      if (title === undefined) continue; // no explicit title — falls back to Storybook's auto-title, not checked here
      const files = filesByTitle.get(title) ?? [];
      files.push(file);
      filesByTitle.set(title, files);
    }

    expect(storyFiles.length).toBeGreaterThan(0);

    const collisions = [...filesByTitle.entries()].filter(([, files]) => files.length > 1);
    expect(
      collisions,
      `these story files share an explicit Storybook title, which collides on any story name ` +
        `they both export: ${collisions.map(([title, files]) => `"${title}": ${files.join(', ')}`).join('; ')}`
    ).toEqual([]);
  });
});
