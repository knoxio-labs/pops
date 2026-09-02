/**
 * The design-surface predicate two workflows share (`pr-review.yml` skips
 * the LLM review on it; `review-findings-gate.yml` stops waiting for that
 * review on it). It is fail-closed: the exemption has to be proven from the
 * changed-file list, and every way the evidence can be missing comes out as
 * "not exempt".
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DESIGN_SURFACE_PREFIXES,
  isDesignSurfaceOnly,
  parsePathList,
  selfTest,
} from '../design-surface-only.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, '..', 'design-surface-only.mjs');
const repoRoot = resolve(here, '..', '..', '..');

function run(stdin: string, ...args: string[]): { status: number; stdout: string } {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], {
      input: stdin,
      encoding: 'utf8',
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: 0, stdout };
  } catch (error) {
    const failed = error as { status: number; stdout: string };
    return { status: failed.status, stdout: failed.stdout };
  }
}

describe('isDesignSurfaceOnly', () => {
  it('accepts a diff confined to screens, experiments and fixtures', () => {
    expect(
      isDesignSurfaceOnly([
        'pillars/design/src/screens/finance/import-review.tsx',
        'pillars/design/src/experiments/density/experiment.yaml',
        'pillars/design/src/fixtures/import-review.ts',
      ])
    ).toBe(true);
  });

  it('is fail-closed on an empty or blank list', () => {
    expect(isDesignSurfaceOnly([])).toBe(false);
    expect(isDesignSurfaceOnly(['', '  '])).toBe(false);
  });

  it('rejects a diff that also touches the playground chrome or anything outside the pillar', () => {
    expect(
      isDesignSurfaceOnly([
        'pillars/design/src/screens/f/s.tsx',
        'pillars/design/src/shell/Dock.tsx',
      ])
    ).toBe(false);
    expect(isDesignSurfaceOnly(['pillars/design/src/screens/f/s.tsx', 'AGENTS.md'])).toBe(false);
  });

  it('matches by directory prefix, not by substring', () => {
    expect(isDesignSurfaceOnly(['pillars/design/src/screens-old/f/s.tsx'])).toBe(false);
    expect(isDesignSurfaceOnly(['docs/pillars/design/src/screens/x.tsx'])).toBe(false);
  });

  it('names exactly the three surface directories', () => {
    expect([...DESIGN_SURFACE_PREFIXES]).toEqual([
      'pillars/design/src/screens/',
      'pillars/design/src/experiments/',
      'pillars/design/src/fixtures/',
    ]);
  });
});

describe('parsePathList', () => {
  it('splits on either line ending and drops blanks', () => {
    expect(parsePathList('a\r\nb\n\n  \nc')).toEqual(['a', 'b', 'c']);
  });
});

describe('the CLI', () => {
  it('exits 0 on a surface-only list and 1 otherwise', () => {
    expect(run('pillars/design/src/screens/f/s.tsx\n').status).toBe(0);
    expect(run('pillars/design/src/screens/f/s.tsx\npillars/design/Dockerfile\n').status).toBe(1);
  });

  it('exits 1 on empty input — the exemption is never assumed', () => {
    expect(run('').status).toBe(1);
  });

  it('exits 2 on an unknown argument', () => {
    expect(run('', '--nope').status).toBe(2);
  });

  it('passes its own self-test, and the self-test covers the degenerate cases', () => {
    expect(selfTest()).toEqual([]);
    expect(run('', '--self-test').status).toBe(0);
  });
});
