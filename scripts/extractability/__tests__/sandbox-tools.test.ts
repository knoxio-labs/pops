import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkOutOfUnitScriptTools, sandboxToolDependencies } from '../sandbox-tools.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const aiUnit = join(repoRoot, 'pillars', 'ai');

describe('sandboxToolDependencies', () => {
  it('uses the root formatter version for units that generate OpenAPI snapshots', () => {
    const packageManifest = {
      devDependencies: { '@pops/contract-openapi': 'workspace:*' },
    };
    const rootPackageManifest = { devDependencies: { oxfmt: '^0.67.0' } };

    expect(sandboxToolDependencies(aiUnit, packageManifest, rootPackageManifest)).toEqual({
      oxfmt: '^0.67.0',
    });
  });

  it('detects formatter commands in unit source files', () => {
    expect(sandboxToolDependencies(aiUnit, {}, { devDependencies: { oxfmt: '^0.67.0' } })).toEqual({
      oxfmt: '^0.67.0',
    });
  });

  it('names the formatter when the root no longer declares a required provider', () => {
    expect(() =>
      sandboxToolDependencies(aiUnit, { dependencies: { '@pops/contract-openapi': '*' } }, {})
    ).toThrow('requires tool "oxfmt"');
  });
});

describe('checkOutOfUnitScriptTools', () => {
  it('accepts the sandbox-provided build-graph check', () => {
    expect(() =>
      checkOutOfUnitScriptTools(aiUnit, {
        scripts: { typecheck: 'node ../../scripts/require-built-graph.mjs && tsc --noEmit' },
      })
    ).not.toThrow();
  });

  it('fails with the missing tool name for an unprovided root script', () => {
    expect(() =>
      checkOutOfUnitScriptTools(aiUnit, {
        scripts: { build: 'node ../../scripts/missing-generator.mjs' },
      })
    ).toThrow('tool "missing-generator.mjs"');
  });
});
