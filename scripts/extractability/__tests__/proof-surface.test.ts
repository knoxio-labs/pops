import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computeProofSurface, toWireLine } from '../proof-surface.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const sandboxScript = join(repoRoot, 'scripts', 'extractability', 'sandbox.sh');
const proofSurfaceScript = join(repoRoot, 'scripts', 'extractability', 'proof-surface.mjs');

describe('computeProofSurface', () => {
  it('proves a unit with a build script', () => {
    const surface = computeProofSurface({ scripts: { build: 'tsc -b' } });
    expect(surface.decision).toBe('prove');
    expect(surface.hasBuild).toBe(true);
  });

  it('proves a unit with only typecheck/test (shell-bundled app unit)', () => {
    const surface = computeProofSurface({
      scripts: { typecheck: 'tsc --noEmit', test: 'vitest run' },
    });
    expect(surface.decision).toBe('prove');
    expect(surface.hasBuild).toBe(false);
    expect(surface.hasTypecheck).toBe(true);
    expect(surface.hasTest).toBe(true);
    expect(surface.testScript).toBe('test');
  });

  it('prefers test:coverage over test when both are declared', () => {
    const surface = computeProofSurface({
      scripts: { 'test:coverage': 'vitest run --coverage', test: 'vitest run' },
    });
    expect(surface.testScript).toBe('test:coverage');
  });

  it('is a violation — not a skip — when scripts are empty and nothing is declared', () => {
    const surface = computeProofSurface({ scripts: {} });
    expect(surface.decision).toBe('violation');
  });

  it('is a violation — not a skip — when scripts exist but none are recognized (the rename case)', () => {
    // The exact failure this guard exists to catch: `typecheck` renamed to
    // `types:check`, `build`/`test` renamed or dropped too. The unit still has
    // a real proof surface — just not under a name sandbox.sh recognizes — and
    // that must never look identical to a genuinely data-only package.
    const surface = computeProofSurface({
      scripts: { compile: 'tsc -b', 'types:check': 'tsc --noEmit', 'vitest:run': 'vitest run' },
    });
    expect(surface.decision).toBe('violation');
    expect(surface.scriptNames).toEqual(['compile', 'types:check', 'vitest:run']);
  });

  it('skips — with the declared reason — when the unit opts out explicitly', () => {
    const surface = computeProofSurface({
      scripts: {},
      pops: { extractability: { noProofSurface: 'data-only, see README' } },
    });
    expect(surface.decision).toBe('skip-declared');
    expect(surface.noProofSurfaceReason).toBe('data-only, see README');
  });

  it('honors the opt-out even when unrecognized scripts are present', () => {
    const surface = computeProofSurface({
      scripts: { lint: 'oxlint' },
      pops: { extractability: { noProofSurface: 'lint-only tooling package' } },
    });
    expect(surface.decision).toBe('skip-declared');
  });

  it('does not accept an empty-string opt-out as a declaration', () => {
    const surface = computeProofSurface({
      scripts: {},
      pops: { extractability: { noProofSurface: '   ' } },
    });
    expect(surface.decision).toBe('violation');
    expect(surface.noProofSurfaceReason).toBeNull();
  });

  it('does not accept a non-string opt-out as a declaration', () => {
    const surface = computeProofSurface({
      scripts: {},
      pops: { extractability: { noProofSurface: true } },
    });
    expect(surface.decision).toBe('violation');
  });

  it('a real build script still wins over a declared opt-out', () => {
    const surface = computeProofSurface({
      scripts: { build: 'tsc -b' },
      pops: { extractability: { noProofSurface: 'stale marker' } },
    });
    expect(surface.decision).toBe('prove');
  });
});

describe('toWireLine', () => {
  it('leaves a plain single-line string untouched', () => {
    expect(toWireLine('data-only, see README')).toBe('data-only, see README');
  });

  it('collapses embedded newlines and carriage-returns to spaces', () => {
    // A free-form `noProofSurface` reason is JSON text and could legally
    // contain `\n`/`\r`. If that reached stdout verbatim it would grow the
    // 7-line positional payload sandbox.sh reads with `mapfile`, shifting
    // every field after it.
    expect(toWireLine('line one\nline two')).toBe('line one line two');
    expect(toWireLine('line one\r\nline two')).toBe('line one line two');
    expect(toWireLine('a\nb\rc')).toBe('a b c');
  });
});

describe('sandbox.sh: the EX-2 skip decision (real script, fixture units)', () => {
  let root: string;
  let renamedUnit: string;
  let optOutUnit: string;
  let malformedUnit: string;
  let multilineReasonUnit: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'ex2-proof-surface-'));

    renamedUnit = join(root, 'renamed-fixture');
    mkdirSync(renamedUnit, { recursive: true });
    writeFileSync(
      join(renamedUnit, 'package.json'),
      JSON.stringify(
        {
          name: '@pops/renamed-fixture',
          version: '0.0.0',
          private: true,
          // The ticket's exact scenario: `typecheck` renamed to `types:check`,
          // `build` and `test` renamed too. sandbox.sh must not treat this
          // like a data-only package with nothing to prove.
          scripts: { compile: 'tsc -b', 'types:check': 'tsc --noEmit', 'vitest:run': 'vitest run' },
        },
        null,
        2
      )
    );

    optOutUnit = join(root, 'opt-out-fixture');
    mkdirSync(optOutUnit, { recursive: true });
    writeFileSync(
      join(optOutUnit, 'package.json'),
      JSON.stringify(
        {
          name: '@pops/opt-out-fixture',
          version: '0.0.0',
          private: true,
          pops: { extractability: { noProofSurface: 'fixture: intentionally data-only' } },
        },
        null,
        2
      )
    );

    malformedUnit = join(root, 'malformed-fixture');
    mkdirSync(malformedUnit, { recursive: true });
    writeFileSync(join(malformedUnit, 'package.json'), '{ this is not valid json');

    multilineReasonUnit = join(root, 'multiline-reason-fixture');
    mkdirSync(multilineReasonUnit, { recursive: true });
    writeFileSync(
      join(multilineReasonUnit, 'package.json'),
      JSON.stringify(
        {
          name: '@pops/multiline-reason-fixture',
          version: '0.0.0',
          private: true,
          // A legal JSON string can carry an embedded newline. The 7-line
          // wire format between proof-surface.mjs and sandbox.sh must survive
          // that without shifting field positions.
          pops: { extractability: { noProofSurface: 'data-only\nsee the README for why' } },
        },
        null,
        2
      )
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("does NOT silently succeed when a unit's proof scripts are renamed away with no declared opt-out", () => {
    const result = spawnSync('bash', [sandboxScript, renamedUnit], { encoding: 'utf8' });

    expect(result.status).not.toBe(0);
    expect(result.status).not.toBeNull();
    // The specific silent-success shape this guard exists to prevent: exit 0
    // with no evidence at all.
    expect(result.stderr).toContain('looked for: build, typecheck, test:coverage, test');
    expect(result.stderr).toContain('compile, types:check, vitest:run');
    expect(result.stderr).not.toContain('nothing to prove, skipping');
    expect(result.stderr).not.toContain('✔ EX-2');
  });

  it('skips legitimately, with the declared reason on the record, for a real opt-out', () => {
    const result = spawnSync('bash', [sandboxScript, optOutUnit], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('declared opt-out: fixture: intentionally data-only');
  });

  it('fails loud rather than silently on a malformed package.json', () => {
    const result = spawnSync('bash', [sandboxScript, malformedUnit], { encoding: 'utf8' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('failed to read');
  });

  it('proof-surface.mjs prints exactly 7 lines even when the opt-out reason has an embedded newline', () => {
    const result = spawnSync('node', [proofSurfaceScript, multilineReasonUnit], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout.split('\n')).toHaveLength(8); // 7 fields + trailing ''
    expect(result.stdout).toContain('data-only see the README for why');
    expect(result.stdout).not.toContain('data-only\nsee the README for why');
  });

  it("sandbox.sh still parses cleanly when a unit's opt-out reason has an embedded newline", () => {
    const result = spawnSync('bash', [sandboxScript, multilineReasonUnit], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('declared opt-out: data-only see the README for why');
    // The array-length guard must not fire on legitimate input.
    expect(result.stderr).not.toContain('expected 7');
  });
});
