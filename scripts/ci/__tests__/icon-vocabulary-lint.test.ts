/**
 * The Action Icon Standards vocabulary (libs/ui/README.md) is enforced by the
 * `no-restricted-imports` entries in `.oxlintrc.json`, not by a bespoke
 * script. These tests drive the real oxlint binary against that config over
 * disposable fixtures, so a config edit that silently stops restricting a
 * banned name — or one that starts flagging its canonical replacement — fails
 * here instead of shipping unnoticed.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const oxlintConfig = join(repoRoot, '.oxlintrc.json');
const oxlintBin = join(repoRoot, 'node_modules', '.bin', 'oxlint');

interface OxlintDiagnostic {
  code: string;
  message: string;
  help?: string;
}

function lint(source: string): OxlintDiagnostic[] {
  const dir = mkdtempSync(join(tmpdir(), 'icon-vocab-'));
  const file = join(dir, 'Fixture.tsx');
  writeFileSync(file, source);
  try {
    const result = spawnSync(oxlintBin, ['-c', oxlintConfig, '--format', 'json', file], {
      encoding: 'utf-8',
    });
    const parsed = JSON.parse(result.stdout) as { diagnostics: OxlintDiagnostic[] };
    return parsed.diagnostics;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function restrictedImportDiagnostics(source: string): OxlintDiagnostic[] {
  return lint(source).filter((d) => d.code === 'eslint(no-restricted-imports)');
}

describe('banned icon imports are reported', () => {
  const cases: Array<[banned: string, canonical: string]> = [
    ['Edit2', 'Pencil'],
    ['PenLine', 'Pencil'],
    ['Trash', 'Trash2'],
    ['Ellipsis', 'MoreHorizontal'],
    ['Cog', 'Settings'],
    ['Gear', 'Settings'],
    ['RefreshCcw', 'RefreshCw'],
  ];

  it.each(cases)('%s -> %s', (banned, canonical) => {
    const diagnostics = restrictedImportDiagnostics(
      `import { ${banned} } from 'lucide-react';\nexport const icon = ${banned};\n`
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain(banned);
    expect(diagnostics[0]?.help).toContain(canonical);
  });

  it('flags a banned name imported alongside a conforming one', () => {
    const diagnostics = restrictedImportDiagnostics(
      "import { Plus, PenLine } from 'lucide-react';\nexport const icons = [Plus, PenLine];\n"
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('PenLine');
  });
});

describe('canonical icon imports are not reported', () => {
  const canonicalNames = [
    'Plus',
    'Pencil',
    'Trash2',
    'MoreHorizontal',
    'MoreVertical',
    'Settings',
    'RefreshCw',
  ];

  it.each(canonicalNames)('%s', (name) => {
    const diagnostics = restrictedImportDiagnostics(
      `import { ${name} } from 'lucide-react';\nexport const icon = ${name};\n`
    );
    expect(diagnostics).toHaveLength(0);
  });

  it('does not flag an unrelated import from lucide-react', () => {
    const diagnostics = restrictedImportDiagnostics(
      "import { Banana } from 'lucide-react';\nexport const icon = Banana;\n"
    );
    expect(diagnostics).toHaveLength(0);
  });
});
