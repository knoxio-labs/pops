import { globSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { storyGlobs } from '../../.storybook/story-globs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STORYBOOK_DIR = resolve(HERE, '../../.storybook');

/**
 * `main.ts` and this test both import `storyGlobs` — there is exactly one
 * list of specifiers, and this expands it exactly the way Storybook does:
 * each entry resolved relative to `.storybook/`, the config's own directory.
 * Two different specifiers can list the same file under two different
 * relative spellings (e.g. `../src/x.tsx` vs `../../ui/src/x.tsx`), so every
 * match is resolved to an absolute path up front.
 */
function matchesPerSpecifier(): string[][] {
  return storyGlobs.map((spec) =>
    globSync(spec, { cwd: STORYBOOK_DIR }).map((file) => resolve(STORYBOOK_DIR, file))
  );
}

describe('storybook stories globs', () => {
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
