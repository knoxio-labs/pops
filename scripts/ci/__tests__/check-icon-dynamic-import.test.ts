/**
 * ADR-045: a guard ships with a test proving it REPORTS, not merely that it
 * passes. The tree carries no dynamic lucide-react import today, so a suite
 * that only ran the guard would be green whether or not the matcher still
 * works. These drive the pure core over source it must flag, over source it
 * must not (including the shapes documented as intentionally undecidable),
 * and over the real frontend tree — so a matcher that silently stops
 * matching, or a discovery walk that silently stops finding files, fails
 * here.
 *
 * This guard reads no external banned-name list (POPS-2100's own decision:
 * ban the dynamic-call SHAPE outright, not particular names), so there is no
 * constant to pin independently per POPS-2181 — the cases below ARE the
 * pinned expectation, not a copy of something the guard itself reads.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { findViolations } from '../check-icon-dynamic-import.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const guard = join(repoRoot, 'scripts', 'ci', 'check-icon-dynamic-import.mjs');

describe('a dynamic import()/require() reaching lucide-react is reported', () => {
  it('reports a bare string-literal dynamic import of the whole package', () => {
    const hits = findViolations('a.tsx', "const m = await import('lucide-react');");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.form).toBe('import');
  });

  it('reports a double-quoted string-literal require() of a deep subpath', () => {
    const hits = findViolations(
      'a.tsx',
      'const m = require("lucide-react/dist/esm/icons/pen-line");'
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.form).toBe('require');
  });

  it('reports a template-literal import with no interpolation', () => {
    expect(findViolations('a.tsx', 'const m = await import(`lucide-react`);')).toHaveLength(1);
  });

  it('reports a template-literal import whose static prefix is a lucide-react subpath, even with an interpolated tail', () => {
    const hits = findViolations(
      'a.tsx',
      'const icon = pick();\nconst m = import(`lucide-react/${icon}`);'
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.line).toBe(2);
  });

  it('reports a same-file, single-hop, literal-only variable-traced import', () => {
    const hits = findViolations(
      'a.tsx',
      "const spec = 'lucide-react';\nconst m = await import(spec);"
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.line).toBe(2);
  });

  it('reports a same-file variable trace through a subpath template literal', () => {
    const hits = findViolations(
      'a.tsx',
      'const spec = `lucide-react/dist/esm/icons/pen-line`;\nrequire(spec);'
    );
    expect(hits).toHaveLength(1);
  });

  it('reports every offending line, not just the first', () => {
    const source = [
      "const a = await import('lucide-react');",
      "const b = require('lucide-react/subpath');",
    ].join('\n');
    expect(findViolations('a.tsx', source).map((v) => v.line)).toEqual([1, 2]);
  });
});

describe('shapes this guard does not attempt — documented, not silent', () => {
  it('does not flag a static named import — that is no-restricted-imports\u2019 job', () => {
    expect(findViolations('a.tsx', "import { Pencil } from 'lucide-react';")).toHaveLength(0);
  });

  it('does not flag a static `export … from` re-export', () => {
    expect(findViolations('a.tsx', "export { Pencil } from 'lucide-react';")).toHaveLength(0);
    expect(findViolations('a.tsx', "export * from 'lucide-react';")).toHaveLength(0);
  });

  it('does not flag a dynamic import of an unrelated package', () => {
    expect(findViolations('a.tsx', "const m = await import('some-other-package');")).toHaveLength(
      0
    );
  });

  it('does not flag a template literal whose interpolation is appended with no slash — not a reachable specifier', () => {
    expect(findViolations('a.tsx', 'const m = import(`lucide-react${suffix}`);')).toHaveLength(0);
  });

  it('does not flag a computed specifier — undecidable, fails open rather than guessing', () => {
    expect(findViolations('a.tsx', 'const m = import(computeSpecifier());')).toHaveLength(0);
  });

  it('does not flag a variable whose value is not a same-file string/template literal', () => {
    expect(
      findViolations('a.tsx', 'const spec = computeSpecifier();\nconst m = import(spec);')
    ).toHaveLength(0);
  });

  it('does not flag a commented-out dynamic import', () => {
    expect(findViolations('a.tsx', "// const m = await import('lucide-react');")).toHaveLength(0);
  });
});

describe('the real oxlint config genuinely does not see the dynamic form', () => {
  const oxlintConfig = join(repoRoot, '.oxlintrc.json');
  const oxlintBin = join(repoRoot, 'node_modules', '.bin', 'oxlint');

  function lint(source: string): Array<{ code: string }> {
    const dir = mkdtempSync(join(tmpdir(), 'icon-dyn-'));
    const file = join(dir, 'Fixture.tsx');
    writeFileSync(file, source);
    try {
      const result = spawnSync(oxlintBin, ['-c', oxlintConfig, '--format', 'json', file], {
        encoding: 'utf-8',
      });
      return (JSON.parse(result.stdout) as { diagnostics: Array<{ code: string }> }).diagnostics;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('no-restricted-imports produces no diagnostic for a dynamic import of a banned name', () => {
    const diagnostics = lint(
      "export async function f() {\n  const { PenLine } = await import('lucide-react');\n  return PenLine;\n}\n"
    );
    expect(diagnostics.filter((d) => d.code === 'eslint(no-restricted-imports)')).toHaveLength(0);
  });

  it('no-restricted-imports DOES still catch the static form — the drift check guards it, not this one', () => {
    const diagnostics = lint(
      "import { PenLine } from 'lucide-react';\nexport const icon = PenLine;\n"
    );
    expect(diagnostics.filter((d) => d.code === 'eslint(no-restricted-imports)')).toHaveLength(1);
  });
});

describe('the guard proves itself', () => {
  it('passes its own --self-test', () => {
    const output = execFileSync(process.execPath, [guard, '--self-test'], { encoding: 'utf-8' });
    expect(output).toMatch(/self-test OK/u);
  });

  it('passes on the real tree and says how much it looked at', () => {
    const stdout = execFileSync(process.execPath, [guard], { encoding: 'utf-8' });
    const scanned = Number(/Scanned (\d+) source file/.exec(stdout)?.[1]);
    expect(scanned).toBeGreaterThan(500);
    expect(stdout).toMatch(/OK — no dynamic import/u);
  });

  // A test proving the guard fails and names a file planted on disk under
  // pillars/ or libs/ is deliberately NOT here: `vitest run scripts/` runs
  // this suite alongside every other tree-scanning guard's own test suite
  // (e.g. scripts/extractability/__tests__/depcheck.test.ts, which asserts a
  // discovered unit declares every package it imports). A file written into
  // the real scanned tree mid-run — even removed in a `finally` — is visible
  // to those concurrent scans and produces a spurious failure unrelated to
  // this guard. That exact interaction was hit and confirmed while writing
  // this suite. The plant-and-observe proof for this guard was done as a
  // manual, sequential step instead (guard run clean, plant written,
  // `node scripts/ci/check-icon-dynamic-import.mjs` re-run and shown to fail
  // naming the planted file and line, fixture removed, guard re-run clean
  // again) — `findViolations`'s own fixture-driven cases above and the
  // `--self-test` fixture cover the same shape without touching disk.
});
