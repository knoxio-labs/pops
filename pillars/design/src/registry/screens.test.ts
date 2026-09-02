import { describe, expect, it } from 'vitest';

import { collectScreens, type CollectScreensArgs } from './screens';

/**
 * The files-or-folders screen model: `<area>/<slug>.tsx` is a leaf,
 * `<area>/<flow>/` is a flow, a flow is one level deep, and an id may not be
 * both. Driven with synthetic glob modules so the rules are pinned without
 * depending on what happens to be checked in.
 */
type Mod = Record<string, Record<string, unknown>>;

const leaf = (title: string, order?: number): Record<string, unknown> => ({
  default: () => null,
  meta: order === undefined ? { title } : { title, order },
});

function run(over: Partial<CollectScreensArgs>) {
  const errors: string[] = over.errors ?? [];
  const screens = collectScreens({
    leafModules: {},
    flowModules: {},
    deepModules: {},
    prefix: 'screens/',
    errors,
    ...over,
  });
  return { screens, errors };
}

describe('collectScreens', () => {
  it('discovers <area>/<slug>.tsx as a leaf screen with a compound id', () => {
    const leafModules: Mod = { '../screens/finance/dashboard.tsx': leaf('Dashboard') };
    const { screens, errors } = run({ leafModules });
    expect(errors).toEqual([]);
    expect(screens).toHaveLength(1);
    expect(screens[0]).toMatchObject({
      id: 'finance/dashboard',
      area: 'finance',
      slug: 'dashboard',
    });
    expect(screens[0]?.component).toBeTypeOf('function');
    expect(screens[0]?.steps).toBeUndefined();
  });

  it('discovers a folder as a flow with ordered steps', () => {
    const flowModules: Mod = {
      '../screens/finance/import/upload.tsx': leaf('Upload', 1),
      '../screens/finance/import/review.tsx': leaf('Review', 2),
    };
    const { screens, errors } = run({ flowModules });
    expect(errors).toEqual([]);
    const flow = screens[0];
    expect(flow?.id).toBe('finance/import');
    expect(flow?.title).toBe('Import');
    expect(flow?.component).toBeUndefined();
    expect(flow?.steps?.map((s) => s.id)).toEqual(['finance/upload', 'finance/review']);
  });

  it('orders screens by area, then order, then slug', () => {
    const leafModules: Mod = {
      '../screens/media/library.tsx': leaf('Library', 1),
      '../screens/finance/zeta.tsx': leaf('Zeta', 2),
      '../screens/finance/alpha.tsx': leaf('Alpha', 2),
      '../screens/finance/first.tsx': leaf('First', 1),
    };
    const { screens } = run({ leafModules });
    expect(screens.map((s) => s.id)).toEqual([
      'finance/first',
      'finance/alpha',
      'finance/zeta',
      'media/library',
    ]);
  });

  it('aggregates flowButtons:false to the flow when any step opts out', () => {
    const flowModules: Mod = {
      '../screens/a/run/one.tsx': leaf('One', 1),
      '../screens/a/run/two.tsx': {
        default: () => null,
        meta: { title: 'Two', order: 2, flowButtons: false },
      },
    };
    const { screens, errors } = run({ flowModules });
    expect(errors).toEqual([]);
    expect(screens[0]?.flowButtons).toBe(false);
  });

  it('rejects a step nested deeper than one level', () => {
    const deepModules: Mod = { '../screens/a/flow/sub/step.tsx': leaf('Too deep') };
    const { errors } = run({ deepModules });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('one level deep');
  });

  it('rejects an id that is both a file and a flow folder', () => {
    const leafModules: Mod = { '../screens/a/quote.tsx': leaf('Quote') };
    const flowModules: Mod = { '../screens/a/quote/step.tsx': leaf('Step') };
    const { errors } = run({ leafModules, flowModules });
    expect(errors.some((e) => e.includes('both a file and a flow folder'))).toBe(true);
  });

  it('reports a missing default export or meta as a contract error, not a crash', () => {
    const leafModules: Mod = {
      '../screens/a/no-default.tsx': { meta: { title: 'X' } },
      '../screens/a/no-meta.tsx': { default: () => null },
    };
    const { screens, errors } = run({ leafModules });
    expect(screens).toEqual([]);
    expect(errors).toHaveLength(2);
  });

  it('reads a valid colocated states export', () => {
    const leafModules: Mod = {
      '../screens/a/dash.tsx': {
        default: () => null,
        meta: { title: 'Dash' },
        states: { empty: () => null, error: () => null },
      },
    };
    const { screens, errors } = run({ leafModules });
    expect(errors).toEqual([]);
    expect(Object.keys(screens[0]?.states ?? {})).toEqual(['empty', 'error']);
  });

  it('degrades a malformed states export to a contract error', () => {
    const leafModules: Mod = {
      '../screens/a/dash.tsx': {
        default: () => null,
        meta: { title: 'Dash' },
        states: { empty: 'not a function' },
      },
    };
    const { screens, errors } = run({ leafModules });
    expect(errors.some((e) => e.includes('invalid `states`'))).toBe(true);
    expect(screens[0]?.component).toBeTypeOf('function');
    expect(screens[0]?.states).toBeUndefined();
  });

  it('ignores modules outside the prefix', () => {
    const leafModules: Mod = { '../experiments/x/variants/v/screens/a/b.tsx': leaf('B') };
    const { screens } = run({ leafModules });
    expect(screens).toEqual([]);
  });
});
