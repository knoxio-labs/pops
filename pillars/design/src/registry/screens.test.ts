import { describe, expect, it } from 'vitest';

import { collectScreens, type CollectScreensArgs } from './screens';

/**
 * The screen model: a `.tsx` file is a screen at its own path however deep,
 * the folders above it group the nav, and a folder is a flow of ordered steps
 * only when it declares itself one with a `flow.yaml`. Driven with synthetic
 * glob modules so the rules are pinned without depending on what happens to
 * be checked in.
 */
type Mod = Record<string, Record<string, unknown>>;

const leaf = (title: string, order?: number): Record<string, unknown> => ({
  default: () => null,
  meta: order === undefined ? { title } : { title, order },
});

const flowYaml = (title: string, order?: number): string =>
  order === undefined ? `title: ${title}\n` : `title: ${title}\norder: ${order}\n`;

function run(over: Partial<CollectScreensArgs>) {
  const errors: string[] = over.errors ?? [];
  const screens = collectScreens({
    modules: {},
    flowMarkers: {},
    prefix: 'screens/',
    errors,
    ...over,
  });
  return { screens, errors };
}

describe('collectScreens', () => {
  it('discovers <area>/<slug>.tsx as a leaf screen with a compound id', () => {
    const modules: Mod = { '../screens/finance/dashboard.tsx': leaf('Dashboard') };
    const { screens, errors } = run({ modules });
    expect(errors).toEqual([]);
    expect(screens).toHaveLength(1);
    expect(screens[0]).toMatchObject({
      id: 'finance/dashboard',
      area: 'finance',
      groups: [],
      slug: 'dashboard',
    });
    expect(screens[0]?.component).toBeTypeOf('function');
    expect(screens[0]?.steps).toBeUndefined();
  });

  it('nests a screen under as many group folders as it has', () => {
    const modules: Mod = {
      '../screens/finance/accounts/form.tsx': leaf('Account form'),
      '../screens/finance/accounts/pickers/entity.tsx': leaf('Entity picker'),
    };
    const { screens, errors } = run({ modules });
    expect(errors).toEqual([]);
    expect(screens.map((s) => s.id)).toEqual([
      'finance/accounts/form',
      'finance/accounts/pickers/entity',
    ]);
    expect(screens.map((s) => s.groups)).toEqual([['accounts'], ['accounts', 'pickers']]);
    expect(screens.every((s) => s.steps === undefined)).toBe(true);
  });

  it('makes a folder a flow only when it declares one, with the title the marker carries', () => {
    const modules: Mod = {
      '../screens/finance/import/upload.tsx': leaf('Upload', 1),
      '../screens/finance/import/review.tsx': leaf('Review', 2),
    };
    const { screens, errors } = run({
      modules,
      flowMarkers: { '../screens/finance/import/flow.yaml': flowYaml('Import a statement') },
    });
    expect(errors).toEqual([]);
    expect(screens).toHaveLength(1);
    const flow = screens[0];
    expect(flow?.id).toBe('finance/import');
    expect(flow?.title).toBe('Import a statement');
    expect(flow?.component).toBeUndefined();
    expect(flow?.steps?.map((s) => s.slug)).toEqual(['upload', 'review']);
    expect(flow?.steps?.map((s) => s.id)).toEqual([
      'finance/import/upload',
      'finance/import/review',
    ]);
  });

  it('takes the flow order from the marker, else from its first step', () => {
    const modules: Mod = { '../screens/a/run/one.tsx': leaf('One', 7) };
    const marked = run({
      modules,
      flowMarkers: { '../screens/a/run/flow.yaml': flowYaml('Run', 2) },
    });
    expect(marked.screens[0]?.order).toBe(2);
    const bare = run({ modules, flowMarkers: { '../screens/a/run/flow.yaml': flowYaml('Run') } });
    expect(bare.screens[0]?.order).toBe(7);
  });

  it('orders screens by area, then order, then id', () => {
    const modules: Mod = {
      '../screens/media/library.tsx': leaf('Library', 1),
      '../screens/finance/zeta.tsx': leaf('Zeta', 2),
      '../screens/finance/accounts/alpha.tsx': leaf('Alpha', 2),
      '../screens/finance/first.tsx': leaf('First', 1),
    };
    const { screens } = run({ modules });
    expect(screens.map((s) => s.id)).toEqual([
      'finance/first',
      'finance/accounts/alpha',
      'finance/zeta',
      'media/library',
    ]);
  });

  it('aggregates flowButtons:false to the flow when any step opts out', () => {
    const modules: Mod = {
      '../screens/a/run/one.tsx': leaf('One', 1),
      '../screens/a/run/two.tsx': {
        default: () => null,
        meta: { title: 'Two', order: 2, flowButtons: false },
      },
    };
    const { screens, errors } = run({
      modules,
      flowMarkers: { '../screens/a/run/flow.yaml': flowYaml('Run') },
    });
    expect(errors).toEqual([]);
    expect(screens[0]?.flowButtons).toBe(false);
  });

  it('rejects a step nested deeper than one level', () => {
    const { screens, errors } = run({
      modules: { '../screens/a/flow/sub/step.tsx': leaf('Too deep') },
      flowMarkers: { '../screens/a/flow/flow.yaml': flowYaml('Flow') },
    });
    expect(errors.some((e) => e.includes('one level deep'))).toBe(true);
    expect(screens).toEqual([]);
  });

  it('rejects a flow declared inside another flow', () => {
    const { errors } = run({
      modules: { '../screens/a/outer/step.tsx': leaf('Step') },
      flowMarkers: {
        '../screens/a/outer/flow.yaml': flowYaml('Outer'),
        '../screens/a/outer/inner/flow.yaml': flowYaml('Inner'),
      },
    });
    expect(errors.some((e) => e.includes('a step cannot be a flow'))).toBe(true);
  });

  it('rejects a flow with no steps', () => {
    const { screens, errors } = run({
      flowMarkers: { '../screens/a/empty/flow.yaml': flowYaml('Empty') },
    });
    expect(errors.some((e) => e.includes('no steps'))).toBe(true);
    expect(screens).toEqual([]);
  });

  it('rejects a malformed flow marker without losing the rest of the tree', () => {
    const { screens, errors } = run({
      modules: { '../screens/a/dash.tsx': leaf('Dash') },
      flowMarkers: { '../screens/a/run/flow.yaml': 'order: 2\n' },
    });
    expect(errors).toHaveLength(1);
    expect(screens.map((s) => s.id)).toEqual(['a/dash']);
  });

  it('rejects an id that is both a file and a flow folder', () => {
    const { errors } = run({
      modules: {
        '../screens/a/quote.tsx': leaf('Quote'),
        '../screens/a/quote/step.tsx': leaf('Step'),
      },
      flowMarkers: { '../screens/a/quote/flow.yaml': flowYaml('Quote') },
    });
    expect(errors.some((e) => e.includes('both a file and a flow folder'))).toBe(true);
  });

  it('rejects an id that is both a file and a group folder', () => {
    const { errors } = run({
      modules: {
        '../screens/a/accounts.tsx': leaf('Accounts'),
        '../screens/a/accounts/form.tsx': leaf('Form'),
      },
    });
    expect(errors.some((e) => e.includes('both a file and a folder'))).toBe(true);
  });

  it('rejects a screen with no area to sit under', () => {
    const { screens, errors } = run({ modules: { '../screens/loose.tsx': leaf('Loose') } });
    expect(errors.some((e) => e.includes('lives under an area'))).toBe(true);
    expect(screens).toEqual([]);
  });

  it('reports a missing default export or meta as a contract error, not a crash', () => {
    const modules: Mod = {
      '../screens/a/no-default.tsx': { meta: { title: 'X' } },
      '../screens/a/no-meta.tsx': { default: () => null },
    };
    const { screens, errors } = run({ modules });
    expect(screens).toEqual([]);
    expect(errors).toHaveLength(2);
  });

  it('reads a valid colocated states export', () => {
    const modules: Mod = {
      '../screens/a/dash.tsx': {
        default: () => null,
        meta: { title: 'Dash' },
        states: { empty: () => null, error: () => null },
      },
    };
    const { screens, errors } = run({ modules });
    expect(errors).toEqual([]);
    expect(Object.keys(screens[0]?.states ?? {})).toEqual(['empty', 'error']);
  });

  it('degrades a malformed states export to a contract error', () => {
    const modules: Mod = {
      '../screens/a/dash.tsx': {
        default: () => null,
        meta: { title: 'Dash' },
        states: { empty: 'not a function' },
      },
    };
    const { screens, errors } = run({ modules });
    expect(errors.some((e) => e.includes('invalid `states`'))).toBe(true);
    expect(screens[0]?.component).toBeTypeOf('function');
    expect(screens[0]?.states).toBeUndefined();
  });

  it('ignores modules outside the prefix', () => {
    const modules: Mod = { '../experiments/x/variants/v/screens/a/b.tsx': leaf('B') };
    const { screens } = run({ modules });
    expect(screens).toEqual([]);
  });
});
