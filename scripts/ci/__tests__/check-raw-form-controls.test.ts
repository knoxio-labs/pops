/**
 * ADR-045: a guard ships with a test proving it REPORTS, not merely that it
 * passes. These drive the pure core over source it must flag, over source it
 * must not, over the ratchet's upper-bound comparison and the base-diff rule
 * that replaced POPS-3187's exact-equality check (POPS-3236), and over the
 * real pillar tree — so a matcher that silently stops matching, or a
 * discovery walk that silently stops finding files, fails here.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, inject, it } from 'vitest';

import {
  diffAgainstBaseline,
  findViolations,
  isScannable,
  parseBaseline,
  pillarOf,
  readBaselineAt,
} from '../check-raw-form-controls.mjs';
import { gitEnv } from '../resolve-report-base.mjs';
import { passingProofStdout, proofOf } from './real-tree-proofs.js';

describe('a raw form control is reported', () => {
  it('reports a raw <select>', () => {
    const hits = findViolations(
      'pillars/x/app/src/A.tsx',
      '<select value={v} onChange={f}><option value="a">A</option></select>'
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.tag).toBe('select');
  });

  it('reports a raw <input> with no type', () => {
    const hits = findViolations('pillars/x/app/src/A.tsx', '<input value={v} onChange={f} />');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.tag).toBe('input');
  });

  it('reports a raw <input type="text">', () => {
    expect(
      findViolations('pillars/x/app/src/A.tsx', '<input type="text" value={v} onChange={f} />')
    ).toHaveLength(1);
  });

  it('reports a raw <input> whose type is dynamic — not provably "file"', () => {
    expect(
      findViolations('pillars/x/app/src/A.tsx', '<input type={kind} value={v} onChange={f} />')
    ).toHaveLength(1);
  });

  it('reports a raw <textarea>', () => {
    const hits = findViolations('pillars/x/app/src/A.tsx', '<textarea value={v} onChange={f} />');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.tag).toBe('textarea');
  });

  it('reports the 1-based line the opening tag starts on', () => {
    const source = [
      'function Row() {',
      '  return (',
      '    <input',
      '      value={v}',
      '      onChange={f}',
      '    />',
      '  );',
      '}',
    ].join('\n');
    expect(findViolations('a.tsx', source)).toEqual([
      expect.objectContaining({ line: 3, tag: 'input' }),
    ]);
  });

  it('does not desync on a `>` inside an attribute expression before the tag closes', () => {
    const source = ['<input', '  value={v}', '  onChange={() => setOpen(a > b)}', '/>'].join('\n');
    expect(findViolations('a.tsx', source)).toHaveLength(1);
  });

  it('reports each offending control on its own line, not just the first', () => {
    const source = [
      '<input value={a} />',
      '<select value={b}><option value="x" /></select>',
      '<textarea value={c} />',
    ].join('\n');
    expect(findViolations('a.tsx', source).map((v) => v.line)).toEqual([1, 2, 3]);
  });
});

describe('the FileUpload exception and non-matches', () => {
  it('does not report a literal type="file" input', () => {
    expect(findViolations('a.tsx', '<input type="file" onChange={f} />')).toHaveLength(0);
  });

  it("does not report a brace-wrapped literal type={'file'} input", () => {
    expect(findViolations('a.tsx', "<input type={'file'} onChange={f} />")).toHaveLength(0);
  });

  it('does not report a kit Select component — uppercase is not a native element', () => {
    expect(findViolations('a.tsx', '<Select value={v} onChange={f} />')).toHaveLength(0);
  });

  it('does not report a kit Input component', () => {
    expect(findViolations('a.tsx', '<Input value={v} onChange={f} />')).toHaveLength(0);
  });

  it('does not report a kit TextArea component', () => {
    expect(findViolations('a.tsx', '<TextArea value={v} onChange={f} />')).toHaveLength(0);
  });

  it('does not report a tag mentioned inside a JSDoc block comment', () => {
    const source = [
      '/**',
      ' * Native `<select>` for the sort mode. Native is deliberate.',
      ' */',
      'export const x = 1;',
    ].join('\n');
    expect(findViolations('a.tsx', source)).toHaveLength(0);
  });

  it('does not report a tag mentioned inside a `//` line comment', () => {
    expect(
      findViolations(
        'a.tsx',
        '// TODO: replace this with <input type="text" /> once the kit ships one'
      )
    ).toHaveLength(0);
  });

  it('does not report a tag mentioned inside a JSX comment', () => {
    expect(
      findViolations('a.tsx', '{/* was <textarea /> before the kit migration */}')
    ).toHaveLength(0);
  });

  it('a real control still reports on the line after a comment mentioning the same tag', () => {
    const source = ['// <select> used to live here', '<select value={v}><option /></select>'].join(
      '\n'
    );
    const hits = findViolations('a.tsx', source);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.line).toBe(2);
  });
});

describe('isScannable', () => {
  it('scans pillar app .tsx and .jsx source', () => {
    expect(isScannable('pillars/food/app/src/pages/X.tsx')).toBe(true);
    expect(isScannable('pillars/food/app/src/pages/X.jsx')).toBe(true);
  });

  it('exempts stories, tests, __tests__, e2e, generated clients, and non-JSX files', () => {
    expect(isScannable('pillars/lists/app/src/Foo.stories.tsx')).toBe(false);
    expect(isScannable('pillars/lists/app/src/Foo.test.tsx')).toBe(false);
    expect(isScannable('pillars/lists/app/src/Foo.spec.tsx')).toBe(false);
    expect(isScannable('pillars/lists/app/src/__tests__/x.tsx')).toBe(false);
    expect(isScannable('pillars/lists/app/e2e/x.tsx')).toBe(false);
    expect(isScannable('pillars/food/app/src/lists-api/types.gen.tsx')).toBe(false);
    expect(isScannable('pillars/food/app/src/pages/X.ts')).toBe(false);
  });
});

describe('pillarOf', () => {
  it("resolves a pillar path to the pillar's id", () => {
    expect(pillarOf('pillars/lists/app/src/X.tsx')).toBe('lists');
    expect(pillarOf('pillars/design/src/kit/Foo.tsx')).toBe('design');
  });

  it('is null for anything outside pillars/, libs/ui included', () => {
    expect(pillarOf('libs/ui/src/components/Select.tsx')).toBeNull();
    expect(pillarOf('scripts/ci/check-raw-form-controls.mjs')).toBeNull();
  });
});

describe('the per-pillar ratchet treats the baseline as an upper bound', () => {
  it('flags a grown count as a new violation', () => {
    const mismatches = diffAgainstBaseline({ demo: 3 }, { demo: 2 }, { demo: 2 });
    expect(mismatches).toEqual([{ pillar: 'demo', was: 2, now: 3, kind: 'grew' }]);
  });

  it('flags a brand-new pillar with no baseline entry at all', () => {
    expect(diffAgainstBaseline({ demo: 1 }, {}, {})).toEqual([
      { pillar: 'demo', was: 0, now: 1, kind: 'grew' },
    ]);
  });

  it('flags growth even when the same change also lowers that pillar’s baseline entry', () => {
    // The one way an upper bound could be gamed from the other direction:
    // drop the entry to a small number while the tree grows past it. Growth
    // is judged against the COMMITTED entry, so this still reports.
    expect(diffAgainstBaseline({ demo: 7 }, { demo: 6 }, { demo: 9 })).toEqual([
      { pillar: 'demo', was: 6, now: 7, kind: 'grew' },
    ]);
  });

  it('lets a paid-down pillar pass with no baseline edit — the POPS-3236 conflict, removed', () => {
    // This is the case the exact-equality rule failed and this one must not:
    // a migration lowers its pillar and leaves the shared JSON file alone, so
    // it cannot conflict with any sibling PR in the same epic.
    expect(diffAgainstBaseline({ demo: 0 }, { demo: 5 }, { demo: 5 })).toEqual([]);
  });

  it('does not fail an unrelated change over a pillar main already sits below', () => {
    // The failure mode that rules out POPS-3236's literal option 2 ("allow a
    // decrease only where the diff touches that pillar"): once one migration
    // lands without a baseline edit, main itself is below its baseline, and
    // every later PR would fail on a decrease it did not cause.
    expect(
      diffAgainstBaseline({ demo: 2, other: 1 }, { demo: 5, other: 1 }, { demo: 5, other: 1 })
    ).toEqual([]);
  });

  it('an exact match across several pillars is clean', () => {
    expect(diffAgainstBaseline({ alpha: 3, beta: 0 }, { alpha: 3, beta: 0 }, { alpha: 3 })).toEqual(
      []
    );
  });

  it('a pillar present in only one side, at zero, is not a phantom mismatch', () => {
    expect(diffAgainstBaseline({ alpha: 1 }, { alpha: 1, gamma: 0 }, { alpha: 1 })).toEqual([]);
  });
});

describe('a baseline entry raised above the tree is what replaces the downward check', () => {
  it('flags an entry this change raised above the real count', () => {
    expect(diffAgainstBaseline({ demo: 2 }, { demo: 100 }, { demo: 2 })).toEqual([
      { pillar: 'demo', was: 100, now: 2, kind: 'inflated' },
    ]);
  });

  it('flags a baseline entry invented for a pillar that has no violations at all', () => {
    expect(diffAgainstBaseline({}, { demo: 1 }, {})).toEqual([
      { pillar: 'demo', was: 1, now: 0, kind: 'inflated' },
    ]);
  });

  it('flags a raise even when the tree is still below the entry it started from', () => {
    // Base 3, raised to 8, tree at 2. The old equality rule and this one both
    // report; a naive "did it get bigger than the tree" that only looked at
    // the committed file could not tell this from the honest staleness above.
    expect(diffAgainstBaseline({ demo: 2 }, { demo: 8 }, { demo: 3 })).toEqual([
      { pillar: 'demo', was: 8, now: 2, kind: 'inflated' },
    ]);
  });

  it('says nothing when the entry was untouched, however stale it is', () => {
    expect(diffAgainstBaseline({ demo: 2 }, { demo: 100 }, { demo: 100 })).toEqual([]);
  });

  it('says nothing when the entry was lowered but still sits above the tree', () => {
    expect(diffAgainstBaseline({ demo: 2 }, { demo: 40 }, { demo: 90 })).toEqual([]);
  });

  it('cannot run at all without a base, and reports nothing rather than guessing', () => {
    // The degraded shape. `runCheck` prints a line that is NOT its success
    // line whenever it takes this path — the guard must never report the
    // inflation half as checked when it had no diff to check it against.
    expect(diffAgainstBaseline({ demo: 2 }, { demo: 100 })).toEqual([]);
    expect(diffAgainstBaseline({ demo: 2 }, { demo: 100 }, null)).toEqual([]);
  });
});

describe('parseBaseline rejects a shape the ratchet cannot compare', () => {
  it('rejects string counts rather than comparing them by coercion', () => {
    // `"100" > 2` is true and `2 > "100"` is false in JavaScript, so an
    // unvalidated string baseline would read as a silent pass.
    expect(() => parseBaseline('{"demo":"100"}', 'fixture')).toThrow(/non-negative integer/u);
  });

  it('rejects a negative or fractional count', () => {
    expect(() => parseBaseline('{"demo":-1}', 'fixture')).toThrow(/non-negative integer/u);
    expect(() => parseBaseline('{"demo":1.5}', 'fixture')).toThrow(/non-negative integer/u);
  });

  it('rejects an array and a bare scalar', () => {
    expect(() => parseBaseline('[]', 'fixture')).toThrow(/pillar → count/u);
    expect(() => parseBaseline('3', 'fixture')).toThrow(/pillar → count/u);
  });

  it('accepts a well-formed baseline', () => {
    expect(parseBaseline('{"demo":3,"other":0}', 'fixture')).toEqual({ demo: 3, other: 0 });
  });
});

describe('readBaselineAt', () => {
  const scratch: string[] = [];

  afterAll(() => {
    for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  });

  /** A throwaway repo with one commit; `write` decides what that commit holds. */
  function fixtureRepo(write: (dir: string) => void): string {
    const dir = mkdtempSync(join(tmpdir(), 'raw-form-control-baseline-'));
    scratch.push(dir);
    const git = (args: readonly string[]): void => {
      execFileSync('git', [...args], {
        cwd: dir,
        stdio: 'pipe',
        env: gitEnv({
          GIT_AUTHOR_NAME: 'raw-form-control-test',
          GIT_AUTHOR_EMAIL: 'raw-form-control-test@example.invalid',
          GIT_COMMITTER_NAME: 'raw-form-control-test',
          GIT_COMMITTER_EMAIL: 'raw-form-control-test@example.invalid',
        }),
      });
    };
    git(['init', '--quiet', '-b', 'main']);
    write(dir);
    git(['add', '-A']);
    git(['commit', '--quiet', '-m', 'fixture']);
    return dir;
  }

  it('reads the baseline as it stood at the given commit', () => {
    const dir = fixtureRepo((d) => {
      writeFileSync(join(d, '.raw-form-control-baseline.json'), '{\n  "lists": 13\n}\n');
    });
    expect(readBaselineAt('HEAD', dir)).toEqual({ lists: 13 });
  });

  it('reads a commit that predates the baseline file as an empty baseline, not as unknown', () => {
    // `{}` and `null` are not interchangeable: `{}` means every entry is new
    // and therefore raised, while `null` skips the check entirely. Collapsing
    // them would hand a change the unchecked path just for deleting the file.
    const dir = fixtureRepo((d) => {
      writeFileSync(join(d, 'seed.txt'), 'seed\n');
    });
    expect(readBaselineAt('HEAD', dir)).toEqual({});
  });

  it('reports a commit it cannot resolve as null rather than as an empty baseline', () => {
    const dir = fixtureRepo((d) => {
      writeFileSync(join(d, '.raw-form-control-baseline.json'), '{}\n');
    });
    expect(readBaselineAt('0000000000000000000000000000000000000000', dir)).toBeNull();
    expect(readBaselineAt('no-such-ref', dir)).toBeNull();
  });

  it('throws rather than returning a half-understood baseline when the base commit’s copy is malformed', () => {
    const dir = fixtureRepo((d) => {
      writeFileSync(join(d, '.raw-form-control-baseline.json'), '{ not json ]');
    });
    expect(() => readBaselineAt('HEAD', dir)).toThrow();
  });
});

describe('the guard proves itself', () => {
  it('passes its own --self-test', () => {
    const output = passingProofStdout(
      inject('realTreeProofs'),
      'check-raw-form-controls:self-test'
    );
    expect(output).toMatch(/self-test: scanner read/u);
  });

  it('passes on the real tree at the committed baseline and says how much it looked at', () => {
    const result = proofOf(inject('realTreeProofs'), 'check-raw-form-controls');
    expect(
      result.status,
      `guard exited ${String(result.status)} against the committed baseline — a new raw form ` +
        'control landed. Run `pnpm check:raw-form-controls` locally to see where.' +
        `\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`
    ).toBe(0);
    const scanned = Number(/\((\d+) file\(s\) scanned\)/u.exec(result.stdout)?.[1]);
    expect(scanned).toBeGreaterThan(500);
    expect(result.stdout).toMatch(/none above the committed baseline/u);
  });

  it('passes on the real tree with a base commit, running the raised-baseline half too', () => {
    const result = proofOf(inject('realTreeProofs'), 'check-raw-form-controls:based');
    expect(
      result.status,
      `guard exited ${String(result.status)} with --base HEAD against its own committed ` +
        `baseline.\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`
    ).toBe(0);
    // The degraded-mode notice must be absent: it is the marker that the
    // inflation half did NOT run, and a base was supplied here.
    expect(result.stdout).not.toMatch(/no --base given/u);
  });

  it('announces the half it could not run when spawned with no --base', () => {
    // The proof registry runs the guard exactly as a local invocation does:
    // no base, so no inflation check. ADR-045 requires that to be visible in
    // the output rather than folded into the success line.
    const result = proofOf(inject('realTreeProofs'), 'check-raw-form-controls');
    expect(result.stdout).toMatch(/no --base given, so only the growth half ran/u);
  });
});
