import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildFixtures, main } from '../materialize-tsconfig.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

let root: string;
let stdout: string[];
let stderr: string[];

beforeEach(() => {
  const tempRoot = join(repoRoot, 'tmp');
  mkdirSync(tempRoot, { recursive: true });
  root = mkdtempSync(join(tempRoot, 'materialize-tsconfig-test-'));
  stdout = [];
  stderr = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdout.push(chunk.toString());
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stderr.push(chunk.toString());
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('main — a genuine out-of-unit extends', () => {
  it('inlines the resolved compilerOptions and drops the out-of-unit extends', () => {
    const fixtures = buildFixtures(root);
    const exitCode = main([
      fixtures.withRealExtends.sandboxDir,
      fixtures.withRealExtends.originalDir,
    ]);

    expect(exitCode).toBe(0);
    expect(stdout.join('')).toContain('materialised 1 of 1 tsconfig file(s)');

    const written = JSON.parse(
      readFileSync(join(fixtures.withRealExtends.sandboxDir, 'tsconfig.json'), 'utf8')
    );
    expect(written.extends).toBeUndefined();
    expect(written.compilerOptions.strict).toBe(true);
    expect(written.compilerOptions.skipLibCheck).toBe(true);
    // The unit's own compilerOptions must survive the merge over the inherited ones.
    expect(written.compilerOptions.module).toBe('nodenext');
  });
});

describe('main — a unit that genuinely has no tsconfig', () => {
  it('exits 0 and says so, distinctly from the "materialised" success message', () => {
    const fixtures = buildFixtures(root);
    const exitCode = main([
      fixtures.withoutTsconfig.sandboxDir,
      fixtures.withoutTsconfig.originalDir,
    ]);

    expect(exitCode).toBe(0);
    const message = stdout.join('');
    expect(message).toContain('has no tsconfig*.json');
    expect(message).toContain('nothing to materialise');
    expect(message).not.toContain('materialised 0 tsconfig file(s)');
  });
});

describe('main — nested tsconfig files', () => {
  it('materialises nested external extends', () => {
    const originalDir = join(root, 'nested-original');
    const sandboxDir = join(root, 'nested-sandbox');
    const baseConfig = join(root, 'tsconfig.base.json');
    const originalScripts = join(originalDir, 'scripts');
    const sandboxScripts = join(sandboxDir, 'scripts');
    mkdirSync(originalScripts, { recursive: true });
    mkdirSync(sandboxScripts, { recursive: true });
    writeFileSync(
      baseConfig,
      JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true } })
    );
    writeFileSync(
      join(originalDir, 'tsconfig.json'),
      JSON.stringify({ extends: '../tsconfig.base.json' })
    );
    writeFileSync(
      join(sandboxDir, 'tsconfig.json'),
      JSON.stringify({ extends: '../tsconfig.base.json' })
    );
    writeFileSync(
      join(originalScripts, 'tsconfig.json'),
      JSON.stringify({ extends: '../../tsconfig.base.json' })
    );
    writeFileSync(
      join(sandboxScripts, 'tsconfig.json'),
      JSON.stringify({ extends: '../../tsconfig.base.json' })
    );

    const exitCode = main([sandboxDir, originalDir]);

    expect(exitCode).toBe(0);
    expect(stdout.join('')).toContain('materialised 2 of 2 tsconfig file(s)');
    const nested = JSON.parse(readFileSync(join(sandboxScripts, 'tsconfig.json'), 'utf8'));
    expect(nested.extends).toBeUndefined();
    expect(nested.compilerOptions.skipLibCheck).toBe(true);
  });

  it('preserves a nested config that extends another config inside the unit', () => {
    const originalDir = join(root, 'nested-original');
    const sandboxDir = join(root, 'nested-sandbox');
    const originalScripts = join(originalDir, 'scripts');
    const sandboxScripts = join(sandboxDir, 'scripts');
    mkdirSync(originalScripts, { recursive: true });
    mkdirSync(sandboxScripts, { recursive: true });
    const base = JSON.stringify({ compilerOptions: { strict: true } });
    writeFileSync(join(originalDir, 'tsconfig.json'), base);
    writeFileSync(join(sandboxDir, 'tsconfig.json'), base);
    writeFileSync(
      join(originalScripts, 'tsconfig.json'),
      JSON.stringify({ extends: '../tsconfig.json' })
    );
    writeFileSync(
      join(sandboxScripts, 'tsconfig.json'),
      JSON.stringify({ extends: '../tsconfig.json' })
    );

    const exitCode = main([sandboxDir, originalDir]);

    expect(exitCode).toBe(0);
    expect(stdout.join('')).toContain('materialised 0 of 2 tsconfig file(s)');
    const nested = JSON.parse(readFileSync(join(sandboxScripts, 'tsconfig.json'), 'utf8'));
    expect(nested.extends).toBe('../tsconfig.json');
  });

  it('fails when the copy loses a nested tsconfig', () => {
    const originalDir = join(root, 'nested-original');
    const sandboxDir = join(root, 'nested-sandbox');
    const originalScripts = join(originalDir, 'scripts');
    mkdirSync(originalScripts, { recursive: true });
    mkdirSync(sandboxDir, { recursive: true });
    writeFileSync(join(originalScripts, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));

    const exitCode = main([sandboxDir, originalDir]);

    expect(exitCode).toBe(1);
    expect(stderr.join('')).toContain('scripts/tsconfig.json');
    expect(stderr.join('')).toContain('missing from the sandbox copy');
  });
});

describe('main — a tsconfig renamed away in the sandbox copy', () => {
  it('fails loudly instead of reporting "materialised 0" and exit 0', () => {
    const fixtures = buildFixtures(root);
    const exitCode = main([
      fixtures.renamedInSandbox.sandboxDir,
      fixtures.renamedInSandbox.originalDir,
    ]);

    expect(exitCode).toBe(1);
    const message = stderr.join('');
    expect(message).toContain('tsconfig.json');
    expect(message).toContain(fixtures.renamedInSandbox.originalDir);
    expect(message).toContain('missing from the sandbox copy');
    // The bug this guards against: silently reporting success on stdout.
    expect(stdout.join('')).not.toContain('materialised');
  });

  it('also fails when the mismatch runs the other way (sandbox has it, original does not)', () => {
    const originalDir = join(root, 'orig-missing');
    const sandboxDir = join(root, 'sandbox-only');
    mkdirSync(originalDir, { recursive: true });
    mkdirSync(sandboxDir, { recursive: true });
    writeFileSync(join(sandboxDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));

    const exitCode = main([sandboxDir, originalDir]);

    expect(exitCode).toBe(1);
    expect(stderr.join('')).toContain('missing from');
  });

  it('also fires for tsconfig.build.json, not only tsconfig.json', () => {
    const fixtures = buildFixtures(root);
    const exitCode = main([
      fixtures.renamedBuildJsonInSandbox.sandboxDir,
      fixtures.renamedBuildJsonInSandbox.originalDir,
    ]);

    expect(exitCode).toBe(1);
    const message = stderr.join('');
    expect(message).toContain('tsconfig.build.json');
    expect(message).toContain('missing from the sandbox copy');
  });
});

describe('main — a tsconfig that exists but does not parse', () => {
  it('names the file and the parse failure instead of silently returning null', () => {
    const fixtures = buildFixtures(root);
    const exitCode = main([fixtures.malformed.sandboxDir, fixtures.malformed.originalDir]);

    expect(exitCode).toBe(1);
    const message = stderr.join('');
    expect(message).toContain(join(fixtures.malformed.sandboxDir, 'tsconfig.json'));
    expect(message).toContain('does not parse as JSON');
    expect(stdout.join('')).not.toContain('materialised');
  });

  it('also fires for tsconfig.build.json, not only tsconfig.json', () => {
    const fixtures = buildFixtures(root);
    const exitCode = main([
      fixtures.malformedBuildJson.sandboxDir,
      fixtures.malformedBuildJson.originalDir,
    ]);

    expect(exitCode).toBe(1);
    const message = stderr.join('');
    expect(message).toContain(join(fixtures.malformedBuildJson.sandboxDir, 'tsconfig.build.json'));
    expect(message).toContain('does not parse as JSON');
  });
});

describe('main — a config that is found and processed but needs no changes', () => {
  it('exits 0 with a "materialised 0 of N" report, not conflated with the no-tsconfig case', () => {
    const originalDir = join(root, 'self-contained');
    const sandboxDir = join(root, 'self-contained-sandbox');
    mkdirSync(originalDir, { recursive: true });
    mkdirSync(sandboxDir, { recursive: true });
    const selfContained = JSON.stringify({ compilerOptions: { strict: true } });
    writeFileSync(join(originalDir, 'tsconfig.json'), selfContained);
    writeFileSync(join(sandboxDir, 'tsconfig.json'), selfContained);

    const exitCode = main([sandboxDir, originalDir]);

    expect(exitCode).toBe(0);
    expect(stdout.join('')).toContain('materialised 0 of 1 tsconfig file(s)');
  });
});

describe('main — bad invocation', () => {
  it('returns 2 and prints usage when a directory argument is missing', () => {
    expect(main([])).toBe(2);
    expect(stderr.join('')).toContain('usage:');
  });
});
