import { describe, expect, it } from 'vitest';

import { buildCatalog } from './catalog';

/**
 * Runs discovery against whatever is actually checked in under
 * `src/screens` and `src/experiments` and asserts the contract holds — so a
 * hand-edit or a skill that commits a contract-violating file fails here,
 * without this test knowing any screen by name.
 */
const catalog = buildCatalog();

describe('the checked-in design surface', () => {
  it('discovers at least one screen', () => {
    expect(catalog.screens.length).toBeGreaterThan(0);
  });

  it('has zero contract errors', () => {
    expect(catalog.errors).toEqual([]);
  });

  it('has unique, titled screen ids', () => {
    const ids = catalog.screens.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const screen of catalog.screens) expect(screen.title.length).toBeGreaterThan(0);
  });

  it('gives every experiment at least one variant and a resolvable screen', () => {
    const mainIds = new Set(catalog.screens.map((s) => s.id));
    for (const exp of catalog.experiments) {
      expect(exp.variants.length).toBeGreaterThan(0);
      const variantIds = new Set(exp.variants.flatMap((v) => v.screens.map((s) => s.id)));
      expect(mainIds.has(exp.screen) || variantIds.has(exp.screen)).toBe(true);
      if (exp.chosen !== undefined) {
        expect(exp.variants.map((v) => v.id)).toContain(exp.chosen);
      }
    }
  });

  it('never stacks two active experiments on one screen', () => {
    const screens = catalog.experiments.filter((e) => e.status === 'active').map((e) => e.screen);
    expect(new Set(screens).size).toBe(screens.length);
  });
});
