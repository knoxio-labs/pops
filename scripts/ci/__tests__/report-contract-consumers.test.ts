/**
 * `report-contract-consumers.mjs` is a reporter, not a gate, which changes what
 * its tests have to prove. A gate is wrong when it passes something it should
 * fail; a reporter is wrong when it says nothing — and saying nothing is
 * exactly what it does on the (common, correct) run where no contract changed.
 * So these tests separate the two silences: silent because there is no
 * obligation, and silent because discovery broke.
 *
 * The discovery floor inside the script catches only total loss. This suite
 * pins the EXACT set of vendored legs in the tree today (ADR-045's "pin the set
 * where it is cheap"), so one leg dropping out of the index is a red test on
 * the change that dropped it rather than a quieter report nobody reads.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildConsumerIndex,
  deriveRegenerateHint,
  formatReport,
  miseTaskFor,
  producersInChangeSet,
  readChangedPaths,
} from '../report-contract-consumers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const scriptPath = join(repoRoot, 'scripts', 'ci', 'report-contract-consumers.mjs');

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

function sandbox(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

interface RunResult {
  stdout: string;
  status: number;
}

function run(args: string[]): RunResult {
  try {
    return {
      stdout: execFileSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' }),
      status: 0,
    };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
      status: failure.status ?? -1,
    };
  }
}

/** Repo-relative, posix — the shape `git diff --name-only` prints. */
function relPath(absolute: string): string {
  return relative(repoRoot, absolute);
}

/** The reader the script itself uses: `null` for absent, never a throw-to-null. */
function readTextOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

describe('the real tree', () => {
  const index = buildConsumerIndex(repoRoot);

  // The set, not a count: a leg silently dropping out of discovery is the
  // failure this reporter is least able to notice about itself.
  it('vendors exactly the legs this repo knows about', () => {
    const legs = [...index.entries()].flatMap(([pillarId, rows]) =>
      rows.map((row) => `${pillarId} -> ${relPath(row.copy)}`)
    );
    expect(legs.toSorted((a, b) => a.localeCompare(b))).toEqual([
      'bfm -> clients/ios/Contracts/bfm.openapi.json',
      'contacts -> pillars/finance/app/contracts/contacts.openapi.json',
      'purchases -> pillars/finance/app/contracts/purchases.openapi.json',
    ]);
  });

  it('carries a declaration for every leg', () => {
    for (const [pillarId, rows] of index) {
      for (const row of rows) {
        expect(
          row.declaredBy,
          `${pillarId} -> ${relPath(row.copy)} is declared by nothing`
        ).not.toBeNull();
      }
    }
  });

  it('derives a runnable regenerate command for every leg', () => {
    for (const [, rows] of index) {
      for (const row of rows) {
        const hint = deriveRegenerateHint(row, readTextOrNull);
        expect(['command', 'task'], `no command derived for ${relPath(row.copy)}`).toContain(
          hint.kind
        );
      }
    }
  });
});

describe('the CLI against the real tree', () => {
  it('names the finance consumer when the purchases contract changes', () => {
    const dir = sandbox('report-consumers-cli-');
    const list = join(dir, 'changed.txt');
    write(list, 'pillars/purchases/openapi/purchases.openapi.json\n');

    const { stdout, status } = run(['--changed-from', list]);
    expect(status).toBe(0);
    expect(stdout).toContain('pillars/finance/app/contracts/purchases.openapi.json');
    expect(stdout).toContain('pnpm --filter @pops/app-finance generate:purchases-client');
    // It must NOT drag in the legs this change does not oblige.
    expect(stdout).not.toContain('clients/ios/Contracts/bfm.openapi.json');
  });

  it('says nothing about consumers when no contract changed', () => {
    const dir = sandbox('report-consumers-cli-');
    const list = join(dir, 'changed.txt');
    write(list, 'pillars/purchases/src/api/orders.ts\nREADME.md\n');

    const { stdout, status } = run(['--changed-from', list]);
    expect(status).toBe(0);
    expect(stdout).toContain('OK —');
    expect(stdout).not.toContain('must follow this contract');
  });

  it('refuses a changed-file list it cannot read rather than treating it as empty', () => {
    const { stdout, status } = run(['--changed-from', join(repoRoot, 'no-such-list.txt')]);
    expect(status).toBe(1);
    expect(stdout).toContain('no such changed-file list');
  });

  it('reports every leg, loudly, when it has no change set to scope to', () => {
    const { stdout, status } = run([]);
    expect(status).toBe(0);
    expect(stdout).toContain('NO CHANGE SET');
    expect(stdout).toContain('clients/ios/Contracts/bfm.openapi.json');
    expect(stdout).toContain('pillars/finance/app/contracts/purchases.openapi.json');
  });

  it('passes its own self-test', () => {
    expect(run(['--self-test']).status).toBe(0);
  });
});

describe('discovery loss is a failure, not a quiet pass', () => {
  it('fails when the tree holds no vendored contract at all', () => {
    const root = sandbox('report-consumers-empty-');
    mkdirSync(join(root, 'pillars', 'purchases', 'openapi'), { recursive: true });
    writeFileSync(join(root, 'pillars', 'purchases', 'openapi', 'purchases.openapi.json'), '{}\n');

    expect(buildConsumerIndex(root).size).toBe(0);

    // And the CLI's floor turns that into an exit code, which is the half a
    // unit test on `buildConsumerIndex` alone would never reach.
    const copied = join(root, 'scripts', 'ci');
    mkdirSync(copied, { recursive: true });
    for (const file of [
      'report-contract-consumers.mjs',
      'check-vendored-contracts.mjs',
      'fixture-copies.mjs',
    ]) {
      copyFileSync(join(repoRoot, 'scripts', 'ci', file), join(copied, file));
    }
    let status = 0;
    let output = '';
    try {
      execFileSync(process.execPath, [join(copied, 'report-contract-consumers.mjs')], {
        encoding: 'utf8',
      });
    } catch (error) {
      const failure = error as { stderr?: string; status?: number };
      status = failure.status ?? -1;
      output = failure.stderr ?? '';
    }
    expect(status).toBe(1);
    expect(output).toContain('discovered zero vendored pillar contracts');
  });
});

describe('producersInChangeSet', () => {
  it('matches anything under a pillar openapi directory, not just the snapshot', () => {
    expect(
      producersInChangeSet([
        'pillars/purchases/openapi/purchases.openapi.json',
        'pillars/bfm/openapi/nested/extra.yaml',
      ])
    ).toEqual(['bfm', 'purchases']);
  });

  it('ignores a pillar change that is not its published contract', () => {
    expect(
      producersInChangeSet([
        'pillars/purchases/src/openapi/generate.ts',
        'pillars/purchases/openapi-notes.md',
        'clients/ios/Contracts/bfm.openapi.json',
      ])
    ).toEqual([]);
  });

  it('deduplicates and sorts', () => {
    expect(
      producersInChangeSet([
        'pillars/purchases/openapi/purchases.openapi.json',
        'pillars/purchases/openapi/purchases.openapi.json',
        'pillars/ai/openapi/ai.openapi.json',
      ])
    ).toEqual(['ai', 'purchases']);
  });
});

describe('formatReport', () => {
  const read = (): string | null => null;

  it('is empty for a producer nothing vendors', () => {
    const index = new Map([
      [
        'purchases',
        [
          {
            pillarId: 'purchases',
            copy: '/repo/pillars/finance/app/contracts/purchases.openapi.json',
            source: '/repo/pillars/purchases/openapi/purchases.openapi.json',
            declaredBy: null,
          },
        ],
      ],
    ]);
    expect(formatReport({ index, producers: ['lists'], read, root: '/repo' })).toEqual([]);
  });

  it('says so when nothing declares a copy the scan found', () => {
    const index = new Map([
      [
        'purchases',
        [
          {
            pillarId: 'purchases',
            copy: '/repo/pillars/finance/app/contracts/purchases.openapi.json',
            source: '/repo/pillars/purchases/openapi/purchases.openapi.json',
            declaredBy: null,
          },
        ],
      ],
    ]);
    const lines = formatReport({ index, producers: ['purchases'], read, root: '/repo' }).join('\n');
    expect(lines).toContain('declared by  (nothing');
    expect(lines).toContain('no codegen config in this tree declares this copy');
  });
});

describe('miseTaskFor', () => {
  it('reads either spelling of a task header', () => {
    expect(miseTaskFor('[tasks."generate:x-client"]\nvendored=Contracts/x.json\n', 'x.json')).toBe(
      'generate:x-client'
    );
    expect(miseTaskFor('[tasks.generate]\nvendored=Contracts/x.json\n', 'x.json')).toBe('generate');
  });

  it('gives up rather than attributing an assignment to the wrong table', () => {
    expect(
      miseTaskFor(
        '[tasks."generate:x-client"]\nrun = "true"\n\n[env]\nvendored=Contracts/x.json\n',
        'x.json'
      )
    ).toBeNull();
  });
});

describe('readChangedPaths', () => {
  it('drops blank lines and trims', () => {
    const { paths } = readChangedPaths('list', () => '  a.txt \n\n b.txt\n');
    expect(paths).toEqual(['a.txt', 'b.txt']);
  });

  it('reports a read failure instead of returning an empty set', () => {
    const { paths, error } = readChangedPaths('list', () => {
      throw new Error('EACCES');
    });
    expect(paths).toBeNull();
    expect(error).toContain('EACCES');
  });
});
