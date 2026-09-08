/**
 * ADR-045: a guard ships with a test proving it REPORTS, not merely that it
 * passes. These drive the pure core over source it must flag, over source it
 * must not, over the ratchet's exact-match comparison (POPS-3187 explicitly
 * requires a hand-inflated baseline to fail, not just a grown one), and over
 * the real pillar tree — so a matcher that silently stops matching, or a
 * discovery walk that silently stops finding files, fails here.
 */

import { describe, expect, inject, it } from 'vitest';

import {
  diffAgainstBaseline,
  findViolations,
  isScannable,
  pillarOf,
} from '../check-raw-form-controls.mjs';
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

describe('the per-pillar ratchet holds the baseline to equality, not just an upper bound', () => {
  it('flags a grown count as a new violation', () => {
    const mismatches = diffAgainstBaseline({ demo: 3 }, { demo: 2 });
    expect(mismatches).toEqual([{ pillar: 'demo', was: 2, now: 3, kind: 'grew' }]);
  });

  it('flags a brand-new pillar with no baseline entry at all', () => {
    const mismatches = diffAgainstBaseline({ demo: 1 }, {});
    expect(mismatches).toEqual([{ pillar: 'demo', was: 0, now: 1, kind: 'grew' }]);
  });

  it('flags a baseline hand-inflated above the real count — the loosening this guard must catch', () => {
    // POPS-3187: "the guard fails if a baseline is set HIGHER than reality —
    // a ratchet that can be loosened silently is not a ratchet." A baseline
    // rewritten by hand to 100 when the tree genuinely has 2 must not read as
    // "shrank, fine".
    const mismatches = diffAgainstBaseline({ demo: 2 }, { demo: 100 });
    expect(mismatches).toEqual([{ pillar: 'demo', was: 100, now: 2, kind: 'stale' }]);
  });

  it('flags a genuine improvement that was never locked in with --write', () => {
    const mismatches = diffAgainstBaseline({ demo: 0 }, { demo: 5 });
    expect(mismatches).toEqual([{ pillar: 'demo', was: 5, now: 0, kind: 'stale' }]);
  });

  it('an exact match across several pillars is clean', () => {
    expect(diffAgainstBaseline({ alpha: 3, beta: 0 }, { alpha: 3, beta: 0 })).toEqual([]);
  });

  it('a pillar present in only one side, at zero, is not a phantom mismatch', () => {
    expect(diffAgainstBaseline({ alpha: 1 }, { alpha: 1, gamma: 0 })).toEqual([]);
  });

  it('cannot be satisfied by inflating a baseline for a pillar that has no violations at all', () => {
    // A pillar with zero real controls but a nonzero baseline entry is the
    // same "stale" shape, at the boundary — proving the equality check, not
    // a `> 0` special case, is what decides it.
    expect(diffAgainstBaseline({}, { demo: 1 })).toEqual([
      { pillar: 'demo', was: 1, now: 0, kind: 'stale' },
    ]);
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
      `guard exited ${String(result.status)} against the committed baseline — either a new raw ` +
        'form control landed, or the baseline is stale. Run `pnpm check:raw-form-controls` ' +
        `locally to see which.\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`
    ).toBe(0);
    const scanned = Number(/\((\d+) file\(s\) scanned\)/u.exec(result.stdout)?.[1]);
    expect(scanned).toBeGreaterThan(500);
    expect(result.stdout).toMatch(/matching the committed baseline exactly/u);
  });
});
