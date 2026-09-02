import { describe, expect, it } from 'vitest';

import {
  EXPERIMENTS_DIR,
  parseArgs as args,
  planScaffold as plan,
  renderExperimentYaml as yaml,
  renderVariantScreen as variantScreen,
} from '../design-new-experiment.mjs';

type Tree = Parameters<typeof plan>[1];

const EMPTY: Tree = {
  experimentExists: false,
  variantExists: () => false,
  readMainScreen: () => undefined,
};

const EXISTING: Tree = {
  experimentExists: true,
  variantExists: (id) => id === 'table',
  readExperimentYaml: () => 'name: D\nstatus: active\nscreen: finance/import-review\n',
  readMainScreen: () => undefined,
};

describe('parseArgs', () => {
  it('accepts a well-formed invocation', () => {
    expect(args(['density', '--screen', 'a/b', '--variant', 'x']).kind).toBe('scaffold');
  });

  it('rejects an invocation with no variant — an experiment with no answers asks nothing', () => {
    expect(args(['density', '--screen', 'a/b']).kind).toBe('error');
  });

  it('rejects an id or a variant that is not kebab-case', () => {
    expect(args(['Density', '--variant', 'x']).kind).toBe('error');
    expect(args(['density', '--variant', 'Table']).kind).toBe('error');
  });

  it('rejects a --screen that is not <area>/<slug>', () => {
    expect(args(['density', '--screen', 'ab', '--variant', 'x']).kind).toBe('error');
    expect(args(['density', '--screen', 'a/b/c', '--variant', 'x']).kind).toBe('error');
  });

  it('rejects a flag with no value rather than swallowing the next flag', () => {
    expect(args(['density', '--variant']).kind).toBe('error');
    expect(args(['density', '--screen', '--variant', 'x']).kind).toBe('error');
  });

  it('rejects an unknown flag rather than ignoring it', () => {
    expect(args(['density', '--variant', 'x', '--colour', 'blue']).kind).toBe('error');
  });
});

describe('planScaffold', () => {
  it('writes an experiment.yaml and one screen per variant', () => {
    const result = plan(
      { id: 'density', variants: ['table', 'cards'], screen: 'finance/import-review' },
      EMPTY
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.files)).toHaveLength(3);
    expect(result.files[`${EXPERIMENTS_DIR}/density/experiment.yaml`]).toContain('status: active');
    expect(
      `${EXPERIMENTS_DIR}/density/variants/cards/screens/finance/import-review.tsx` in result.files
    ).toBe(true);
  });

  it('starts each variant from the main screen, so the first diff is the proposal', () => {
    const result = plan(
      { id: 'density', variants: ['table'], screen: 'finance/import-review' },
      { ...EMPTY, readMainScreen: () => 'export default function Main() {}\n' }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.files[`${EXPERIMENTS_DIR}/density/variants/table/screens/finance/import-review.tsx`]
    ).toBe('export default function Main() {}\n');
  });

  it('refuses a new experiment with no screen — every experiment belongs to one', () => {
    expect(plan({ id: 'density', variants: ['table'] }, EMPTY).ok).toBe(false);
  });

  it('adds a variant to an existing experiment, reading its screen from the yaml', () => {
    const result = plan({ id: 'density', variants: ['grid'] }, EXISTING);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.files)).toEqual([
      `${EXPERIMENTS_DIR}/density/variants/grid/screens/finance/import-review.tsx`,
    ]);
  });

  it('refuses to overwrite an existing variant', () => {
    const result = plan({ id: 'density', variants: ['table'] }, EXISTING);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/already exists/);
  });

  it('refuses to re-screen an existing experiment', () => {
    const result = plan({ id: 'density', variants: ['grid'], screen: 'finance/other' }, EXISTING);
    expect(result.ok).toBe(false);
  });

  it('refuses when it cannot tell which screen an existing experiment explores', () => {
    const result = plan(
      { id: 'density', variants: ['grid'] },
      { ...EXISTING, readExperimentYaml: () => 'name: D\nstatus: active\n' }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/cannot tell which screen/);
  });
});

describe('renderExperimentYaml', () => {
  it('writes only what a new experiment knows — no chosen, decided or rationale', () => {
    const source = yaml({
      id: 'density',
      variants: ['table', 'cards'],
      screen: 'finance/import-review',
      name: 'Density',
      question: 'Table or cards?',
    });
    expect(source).toContain('name: Density');
    expect(source).toContain('question: Table or cards?');
    expect(source).toContain('screen: finance/import-review');
    expect(source).toContain('  table: table');
    expect(source).not.toContain('chosen:');
    expect(source).not.toContain('decided:');
  });

  it('falls back to the id when no display name is given', () => {
    expect(yaml({ id: 'density', variants: ['x'], screen: 'a/b' })).toContain('name: density');
  });
});

describe('renderVariantScreen', () => {
  it('is the main screen verbatim when there is one', () => {
    expect(variantScreen('a/b', 'MAIN')).toBe('MAIN');
  });

  it('is a stub that says so when there is not', () => {
    const stub = variantScreen('finance/import-review', undefined);
    expect(stub).toContain("title: 'import-review'");
    expect(stub).toContain('export default function Screen');
  });
});
