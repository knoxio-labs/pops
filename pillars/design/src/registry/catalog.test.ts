import { describe, expect, it } from 'vitest';

import { buildCatalog } from './catalog';

/**
 * Runs discovery against whatever is actually checked in under
 * `src/screens` and `src/experiments` and asserts the contract holds, so a
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

  /**
   * Several active experiments may share a screen, deliberately: a screen's
   * vocabulary, its status treatment and its density are separate questions,
   * and queueing them answers two by default while the third is reviewed. What
   * the author owes in exchange is a variant note saying which other open
   * question that variant has taken a position on.
   *
   * Ids still have to be distinct — an id is what a comment thread and a
   * recorded decision are anchored to.
   */
  it('has unique experiment ids', () => {
    const ids = catalog.experiments.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
