import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cruise } from 'dependency-cruiser';
import extractDepcruiseOptions from 'dependency-cruiser/config-utl/extract-depcruise-options';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ICruiseResult } from 'dependency-cruiser';

const CONFIG = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.dependency-cruiser.cjs');

/**
 * A throwaway tree shaped like the repo, cruised with the real rule set. The
 * playground's reaches are written as source here rather than committed as
 * files, so the real tree never carries an import the rules forbid.
 */
const TREE: Record<string, string> = {
  'pillars/finance/app/src/index.ts': 'export const navConfig = {};\n',
  'pillars/finance/src/db/internal.ts': 'export const secret = 1;\n',
  'pillars/finance/dist/contract/manifest.js': 'export const FINANCE_NAV = {};\n',
  'pillars/design/src/unresolved-app.ts':
    "import { navConfig } from '@pops/app-finance/design';\nexport { navConfig };\n",
  'pillars/design/src/resolved-app.ts':
    "import { navConfig } from '../../finance/app/src/index.ts';\nexport { navConfig };\n",
  'pillars/design/src/internal.ts':
    "import { secret } from '../../finance/src/db/internal.ts';\nexport { secret };\n",
  'pillars/design/src/contract.ts':
    "import { FINANCE_NAV } from '../../finance/dist/contract/manifest.js';\nexport { FINANCE_NAV };\n",
  'pillars/design/src/unresolved-contract.ts':
    "import { FINANCE_NAV } from '@pops/finance/manifest';\nexport { FINANCE_NAV };\n",
};

let baseDir: string;
let violations: ICruiseResult['summary']['violations'];

function ruleAt(file: string): string[] {
  return violations
    .filter((violation) => violation.from === `pillars/design/src/${file}`)
    .map((violation) => violation.rule.name);
}

beforeAll(async () => {
  baseDir = realpathSync(mkdtempSync(join(tmpdir(), 'depcruise-design-')));
  for (const [path, source] of Object.entries(TREE)) {
    mkdirSync(dirname(join(baseDir, path)), { recursive: true });
    writeFileSync(join(baseDir, path), source);
  }
  const { ruleSet, doNotFollow, exclude } = await extractDepcruiseOptions(CONFIG);
  const result = await cruise(['pillars'], {
    baseDir,
    ruleSet,
    doNotFollow,
    exclude,
    validate: true,
    tsPreCompilationDeps: true,
  });
  if (typeof result.output === 'string') throw new Error('expected a cruise result, got text');
  violations = result.output.summary.violations;
});

afterAll(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe('design-no-app-import', () => {
  it('flags the playground naming a pillar app package, resolved or not', () => {
    expect(ruleAt('unresolved-app.ts')).toEqual(['design-no-app-import']);
    expect(ruleAt('resolved-app.ts')).toEqual(['design-no-app-import']);
  });
});

describe('design-no-cross-internal', () => {
  it('still flags a reach behind another pillar contract', () => {
    expect(ruleAt('internal.ts')).toEqual(['design-no-cross-internal']);
  });

  it('allows a pillar contract package, built or not', () => {
    expect(ruleAt('contract.ts')).toEqual([]);
    expect(ruleAt('unresolved-contract.ts')).toEqual([]);
  });
});
