import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** The first capture group of `re` against `text`, or `undefined` on no match. */
function firstCapture(re: RegExp, text: string): string | undefined {
  return re.exec(text)?.[1];
}

/**
 * Pull a `[tasks.<name>]` field out of a mise.toml source. Used to build the
 * fixtures below out of the REAL `run-all` task body instead of a copy that
 * could silently drift from it — the same reasoning `AGENTS.md` gives for
 * never writing an enumeration out twice.
 */
function extractTaskField(source: string, taskName: string, field: string): string {
  const escapedTask = taskName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const header = new RegExp(`^\\[tasks\\.${escapedTask}\\]\\s*$`, 'm').exec(source);
  if (!header) throw new Error(`no [tasks.${taskName}] section in source`);
  const rest = source.slice(header.index + header[0].length);
  const nextHeader = /^\[/m.exec(rest);
  const body = nextHeader ? rest.slice(0, nextHeader.index) : rest;

  const triple = firstCapture(new RegExp(`^${field}\\s*=\\s*'''\\n([\\s\\S]*?)\\n'''`, 'm'), body);
  if (triple !== undefined) return triple;

  const single = firstCapture(new RegExp(`^${field}\\s*=\\s*'([^']*)'`, 'm'), body);
  if (single !== undefined) return single;

  const double = firstCapture(new RegExp(`^${field}\\s*=\\s*"([^"]*)"`, 'm'), body);
  if (double !== undefined) return double;

  throw new Error(`no "${field}" field in [tasks.${taskName}]`);
}

describe('extractTaskField', () => {
  it('reads a triple-quoted multi-line run body', () => {
    const source = ['[tasks.build]', "run = '''", 'line one', 'line two', "'''"].join('\n');
    expect(extractTaskField(source, 'build', 'run')).toBe('line one\nline two');
  });

  it('reads a single-quoted one-liner', () => {
    expect(extractTaskField('[tasks.build]\nusage = \'arg "<task>"\'\n', 'build', 'usage')).toBe(
      'arg "<task>"'
    );
  });

  it('stops at the next task section', () => {
    const source = [
      '[tasks.build]',
      "run = '''",
      'only this',
      "'''",
      '',
      '[tasks.test]',
      "run = '''",
      'not this',
      "'''",
    ].join('\n');
    expect(extractTaskField(source, 'build', 'run')).toBe('only this');
  });

  it('throws when the task section is absent', () => {
    expect(() => extractTaskField('[tasks.other]\nrun = "x"\n', 'build', 'run')).toThrow(
      /no \[tasks\.build\]/
    );
  });
});

describe('run-all: clients/* discovery (real mise binary)', () => {
  // Fails the suite rather than skipping it: a silent no-op here would make
  // every test below report green without ever exercising the real `run-all`
  // guard, which is worse than not having the suite at all. `mise` is a
  // first-class, mandatory tool for this repo (`mise setup` is step 0 in
  // AGENTS.md), so its absence is a broken environment, not a hardware-gated
  // lane to skip past.
  beforeAll(() => {
    execFileSync('mise', ['--version'], { stdio: 'ignore' });
  });

  let root: string;

  beforeAll(() => {
    const rootMiseToml = readFileSync(join(repoRoot, 'mise.toml'), 'utf8');
    const usage = extractTaskField(rootMiseToml, 'run-all', 'usage');
    const run = extractTaskField(rootMiseToml, 'run-all', 'run');

    root = mkdtempSync(join(tmpdir(), 'run-all-clients-'));

    // A unit in each of the two established kinds, each defining the task
    // under test — the baseline `run-all` already covered before this change.
    mkdirSync(join(root, 'pillars', 'p1'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'p1', 'mise.toml'),
      '[tasks.echo]\nrun = "echo ran-p1 >> \\"$OUT_FILE\\""\n'
    );
    mkdirSync(join(root, 'libs', 'l1'), { recursive: true });
    writeFileSync(
      join(root, 'libs', 'l1', 'mise.toml'),
      '[tasks.echo]\nrun = "echo ran-l1 >> \\"$OUT_FILE\\""\n'
    );

    // A pillar that does NOT define the task under test — must be skipped by
    // the source guard rather than falling through to the inherited root task.
    mkdirSync(join(root, 'pillars', 'p2'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'p2', 'mise.toml'),
      '[tasks.other]\nrun = "echo should-not-run >> \\"$OUT_FILE\\""\n'
    );

    // A client (ADR-043) defining the task, and one that does not — mirrors
    // the pillar/lib pair above, so the guard is proven for the new kind too.
    mkdirSync(join(root, 'clients', 'c1'), { recursive: true });
    writeFileSync(
      join(root, 'clients', 'c1', 'mise.toml'),
      '[tasks.echo]\nrun = "echo ran-c1 >> \\"$OUT_FILE\\""\n'
    );
    mkdirSync(join(root, 'clients', 'c2'), { recursive: true });
    writeFileSync(
      join(root, 'clients', 'c2', 'mise.toml'),
      '[tasks.other]\nrun = "echo should-not-run >> \\"$OUT_FILE\\""\n'
    );

    writeFileSync(
      join(root, 'mise.toml'),
      `[tasks.run-all]\nusage = '${usage}'\nrun = '''\n${run}\n'''\n`
    );
  });
  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function runAllEcho(extraEnv: NodeJS.ProcessEnv): string[] {
    const outFile = join(root, `out-${Math.random().toString(36).slice(2)}.txt`);
    execFileSync('mise', ['run', '-C', root, 'run-all', 'echo'], {
      env: { ...process.env, ...extraEnv, OUT_FILE: outFile },
      stdio: 'pipe',
    });
    return readFileSync(outFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .toSorted((a, b) => a.localeCompare(b));
  }

  it('discovers and runs pillars/* and libs/* units defining the task, unconditionally', () => {
    expect(runAllEcho({})).toEqual(['ran-l1', 'ran-p1']);
  });

  it('does not reach clients/* by default', () => {
    expect(runAllEcho({})).not.toContain('ran-c1');
  });

  it('includes a clients/* unit defining the task once RUN_ALL_INCLUDE_CLIENTS=1', () => {
    expect(runAllEcho({ RUN_ALL_INCLUDE_CLIENTS: '1' })).toEqual(['ran-c1', 'ran-l1', 'ran-p1']);
  });

  it('still skips a clients/* unit lacking the task even when opted in — the exact case the source guard exists for', () => {
    expect(runAllEcho({ RUN_ALL_INCLUDE_CLIENTS: '1' })).not.toContain('should-not-run');
  });
});
