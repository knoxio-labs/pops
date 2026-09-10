/**
 * Every pillar declares its nav exactly once.
 *
 * It used to declare it twice — `pillars/<id>/app/src/nav.ts` in PascalCase,
 * `pillars/<id>/src/api/manifest.ts` as a `NavConfigDescriptor` in kebab — and
 * both finance (three missing links) and media (a rail colour) had drifted
 * before anything checked. A parity gate then made the two
 * literals agree, without making the second one unnecessary.
 *
 * POPS-3359 made it unnecessary: the contract owns the declaration and both
 * consumers project it, so they cannot disagree. That retires the parity
 * guard — there is no second literal left to compare — and leaves this in its
 * place, because "declared once" is now the invariant and an unenforced
 * invariant is how the first one drifted.
 *
 * Deliberately structural rather than semantic. The projection's correctness
 * is the type system's job: `navConfigFromWire` returns literal icon types and
 * the app's `satisfies AppNavConfigShape` checks them against `IconName`, so a
 * wrong icon fails the build. What a type cannot catch is somebody writing the
 * literal out again beside the projection, which is exactly what this catches.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** A nav declaration written out rather than projected: `icon: 'Something'`. */
const PASCAL_ICON_LITERAL = /\bicon:\s*'[A-Z]/u;

/** Pillars that ship an app with a nav module. */
export function pillarsWithAppNav(root = repoRoot): { id: string; nav: string }[] {
  const pillarsRoot = join(root, 'pillars');
  const found: { id: string; nav: string }[] = [];
  for (const entry of readdirSync(pillarsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const nav = join(pillarsRoot, entry.name, 'app', 'src', 'nav.ts');
    if (existsSync(nav)) found.push({ id: entry.name, nav });
  }
  return found.toSorted((a, b) => a.id.localeCompare(b.id));
}

const apps = pillarsWithAppNav();

describe('a pillar declares its nav once', () => {
  it('finds the apps to check — an empty scan would pass this file vacuously', () => {
    expect(apps.map((a) => a.id)).toEqual([
      'ai',
      'bfm',
      'cerebrum',
      'finance',
      'food',
      'inventory',
      'lists',
      'media',
      'purchases',
    ]);
  });

  it.each(apps)('$id projects its nav from the contract', ({ nav }) => {
    expect(readFileSync(nav, 'utf8')).toContain('navConfigFromWire(');
  });

  it.each(apps)('$id writes no PascalCase icon of its own', ({ nav }) => {
    // A projected nav names its icons only in the contract, in kebab. A
    // PascalCase `icon:` here is the second literal coming back.
    expect(PASCAL_ICON_LITERAL.test(readFileSync(nav, 'utf8'))).toBe(false);
  });

  it.each(apps)('$id has a contract nav to project from', ({ id }) => {
    const contract = join(repoRoot, 'pillars', id, 'src', 'contract', 'nav.ts');
    expect(existsSync(contract), contract).toBe(true);
    expect(readFileSync(contract, 'utf8')).toContain('as const');
  });

  it.each(apps)('$id declares its wire nav by projection, not by hand', ({ id }) => {
    const manifest = readFileSync(
      join(repoRoot, 'pillars', id, 'src', 'api', 'manifest.ts'),
      'utf8'
    );
    // `: NavConfigDescriptor = {` is the annotated literal the contract
    // replaced. The projection spells it `satisfies NavConfigDescriptor`,
    // which keeps the check without re-widening the icon types.
    expect(manifest).not.toMatch(/:\s*NavConfigDescriptor\s*=\s*\{/u);
    expect(manifest).toContain('satisfies NavConfigDescriptor');
  });

  it('would notice a second literal coming back', () => {
    // The detector, posed directly. A structural check whose pattern has
    // stopped matching reads exactly like a clean tree.
    expect(PASCAL_ICON_LITERAL.test("  icon: 'BarChart3',")).toBe(true);
    expect(PASCAL_ICON_LITERAL.test("  icon: 'bar-chart-3',")).toBe(false);
    expect(PASCAL_ICON_LITERAL.test('export const navConfig = navConfigFromWire(AI_NAV);')).toBe(
      false
    );
  });
});
