import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkOutOfUnitScriptTools, sandboxToolDependencies } from '../sandbox-tools.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const aiUnit = join(repoRoot, 'pillars', 'ai');

function createEmptyUnit() {
  const tempRoot = join(repoRoot, 'tmp');
  mkdirSync(tempRoot, { recursive: true });
  const fixtureRoot = mkdtempSync(join(tempRoot, 'sandbox-tools-'));
  const unitDir = join(fixtureRoot, 'unit');
  mkdirSync(unitDir);

  return {
    unitDir,
    cleanup: () => rmSync(fixtureRoot, { force: true, recursive: true }),
  };
}

describe('sandboxToolDependencies', () => {
  it('uses the root formatter version for units that generate OpenAPI snapshots', () => {
    const fixture = createEmptyUnit();

    try {
      expect(
        sandboxToolDependencies(
          fixture.unitDir,
          { devDependencies: { '@pops/contract-openapi': 'workspace:*' } },
          { devDependencies: { oxfmt: '^0.67.0' } }
        )
      ).toEqual({ oxfmt: '^0.67.0' });
    } finally {
      fixture.cleanup();
    }
  });

  it('detects formatter commands in unit source files', () => {
    expect(sandboxToolDependencies(aiUnit, {}, { devDependencies: { oxfmt: '^0.67.0' } })).toEqual({
      oxfmt: '^0.67.0',
    });
  });

  it('names the formatter when the root no longer declares a required provider', () => {
    const fixture = createEmptyUnit();

    try {
      expect(() =>
        sandboxToolDependencies(
          fixture.unitDir,
          { dependencies: { '@pops/contract-openapi': '*' } },
          {}
        )
      ).toThrow('requires tool "oxfmt"');
    } finally {
      fixture.cleanup();
    }
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
