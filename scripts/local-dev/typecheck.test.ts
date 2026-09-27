import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { noEmitProject, runTypecheck, tsBuildInfoPath, typecheckCommands } from './typecheck.mjs';

const fixtureRoot = resolve('tmp/local-dev/typecheck-test');

afterEach(() => rmSync(fixtureRoot, { recursive: true, force: true }));

function fixture(script: string, source: string) {
  const unit = join(fixtureRoot, 'unit');
  mkdirSync(unit, { recursive: true });
  writeFileSync(join(unit, 'package.json'), JSON.stringify({ scripts: { typecheck: script } }));
  writeFileSync(
    join(unit, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { noEmit: true }, include: ['src'] })
  );
  mkdirSync(join(unit, 'src'));
  mkdirSync(join(unit, 'scripts'));
  writeFileSync(
    join(unit, 'scripts', 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { noEmit: true }, include: ['check.ts'] })
  );
  writeFileSync(join(unit, 'scripts', 'check.ts'), 'const scriptCheck: string = "ok";');
  writeFileSync(join(unit, 'src', 'index.ts'), source);
  return unit;
}

describe('local incremental typecheck', () => {
  it('keeps each project cache distinct', () => {
    mkdirSync(fixtureRoot, { recursive: true });
    mkdirSync(`${fixtureRoot}-other`, { recursive: true });
    const input = { root: fixtureRoot, unit: join(fixtureRoot, 'unit') };
    expect(tsBuildInfoPath({ ...input, project: 'tsconfig.json' })).not.toBe(
      tsBuildInfoPath({ ...input, project: 'scripts/tsconfig.json' })
    );
    expect(tsBuildInfoPath({ ...input, project: 'tsconfig.json' })).not.toBe(
      tsBuildInfoPath({ ...input, root: `${fixtureRoot}-other`, project: 'tsconfig.json' })
    );
  });

  it('runs every declared config and rechecks after an error and source change', () => {
    const unit = fixture(
      'tsc --noEmit && tsc --noEmit -p scripts/tsconfig.json',
      'const value: string = 1;'
    );
    expect(runTypecheck({ unit, root: fixtureRoot })).not.toBe(0);
    writeFileSync(join(unit, 'src', 'index.ts'), 'const value: string = "ok";');
    expect(runTypecheck({ unit, root: fixtureRoot })).toBe(0);
    expect(existsSync(tsBuildInfoPath({ root: fixtureRoot, unit, project: 'tsconfig.json' }))).toBe(
      true
    );
    expect(
      existsSync(tsBuildInfoPath({ root: fixtureRoot, unit, project: 'scripts/tsconfig.json' }))
    ).toBe(true);
    writeFileSync(join(unit, 'src', 'index.ts'), 'const value: number = "wrong";');
    expect(runTypecheck({ unit, root: fixtureRoot })).not.toBe(0);
  }, 30_000);

  it('parses every portable config while rejecting unsupported shell control flow', () => {
    expect(noEmitProject('tsc --noEmit -p scripts/tsconfig.json')).toBe('scripts/tsconfig.json');
    expect(
      typecheckCommands('node ../../scripts/require-built-graph.mjs && tsc --noEmit')
    ).toHaveLength(2);
    expect(() => typecheckCommands('tsc --noEmit || true')).toThrow('unsupported shell syntax');
  });

  it('keeps shell root, e2e, script, and root-test projects in the canonical entrypoint', () => {
    const manifest = JSON.parse(readFileSync('pillars/shell/package.json', 'utf8')) as {
      scripts: { typecheck: string };
    };
    const projects = typecheckCommands(manifest.scripts.typecheck)
      .map(noEmitProject)
      .filter((project): project is string => project !== null);
    expect(projects).toEqual([
      'tsconfig.json',
      'e2e/tsconfig.json',
      'scripts/tsconfig.json',
      'tsconfig.root-tests.json',
    ]);
  });
});
