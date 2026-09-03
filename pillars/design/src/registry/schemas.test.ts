import { describe, expect, it } from 'vitest';

import { experimentYamlSchema, screenMetaSchema, statesSchema } from './schemas';

/**
 * The schemas are the field-level half of the design-surface contract. Each
 * rule is pinned with a passing and a failing case so a loosened schema
 * cannot slip through.
 */
describe('experimentYamlSchema', () => {
  const base = { name: 'Density', status: 'active', screen: 'finance/import-review' };

  it('accepts a minimal active experiment', () => {
    expect(experimentYamlSchema.safeParse(base).success).toBe(true);
  });

  it('requires a non-empty name', () => {
    expect(experimentYamlSchema.safeParse({ ...base, name: '' }).success).toBe(false);
  });

  it('requires screen to name a path with an area, at any depth', () => {
    expect(experimentYamlSchema.safeParse({ ...base, screen: 'import-review' }).success).toBe(
      false
    );
    expect(experimentYamlSchema.safeParse({ ...base, screen: 'a/b' }).success).toBe(true);
    expect(experimentYamlSchema.safeParse({ ...base, screen: 'a/b/c' }).success).toBe(true);
    expect(experimentYamlSchema.safeParse({ ...base, screen: 'a//c' }).success).toBe(false);
  });

  it('accepts only the three lifecycle statuses', () => {
    for (const status of ['active', 'decided', 'archived']) {
      expect(experimentYamlSchema.safeParse({ ...base, status }).success).toBe(true);
    }
    expect(experimentYamlSchema.safeParse({ ...base, status: 'paused' }).success).toBe(false);
  });

  it('accepts a variants label map and decision fields', () => {
    expect(
      experimentYamlSchema.safeParse({
        ...base,
        status: 'decided',
        variants: { table: 'Dense table', cards: 'Card grid' },
        chosen: 'table',
        rationale: 'Scans faster on the wall iPad',
      }).success
    ).toBe(true);
  });
});

describe('screenMetaSchema', () => {
  it('accepts a title with optional order and flowButtons', () => {
    expect(screenMetaSchema.safeParse({ title: 'Dashboard' }).success).toBe(true);
    expect(
      screenMetaSchema.safeParse({ title: 'Dashboard', order: 1, flowButtons: false }).success
    ).toBe(true);
  });

  it('requires a non-empty title', () => {
    expect(screenMetaSchema.safeParse({}).success).toBe(false);
    expect(screenMetaSchema.safeParse({ title: '' }).success).toBe(false);
  });

  it('rejects non-numeric order and non-boolean flowButtons', () => {
    expect(screenMetaSchema.safeParse({ title: 'D', order: 'first' }).success).toBe(false);
    expect(screenMetaSchema.safeParse({ title: 'D', flowButtons: 'no' }).success).toBe(false);
  });
});

describe('statesSchema', () => {
  it('accepts a map of render functions and rejects anything else', () => {
    expect(statesSchema.safeParse({ empty: () => null }).success).toBe(true);
    expect(statesSchema.safeParse({ empty: 'nope' }).success).toBe(false);
    expect(statesSchema.safeParse({ '': () => null }).success).toBe(false);
  });
});
