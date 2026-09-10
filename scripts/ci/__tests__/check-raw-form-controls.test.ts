/**
 * ADR-045: a guard ships with a test proving it REPORTS, not merely that it
 * passes. These drive the pure core over source it must flag, over source it
 * must not, over the by-name allowlist that replaced the per-pillar count
 * baseline (POPS-3276), and over the real pillar tree — so a matcher that
 * silently stops matching, or a discovery walk that silently stops finding
 * files, fails here.
 */

import { describe, expect, inject, it } from 'vitest';

import {
  ALLOWLIST,
  checkAllowlist,
  findViolations,
  isScannable,
  pillarOf,
} from '../check-raw-form-controls.mjs';
import { passingProofStdout, proofOf } from './real-tree-proofs.js';

/** `n` raw controls in one file, in the shape the scanner emits. */
function raws(file: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({ file, line: i + 1, tag: 'input' as const }));
}

/** Exactly what the committed allowlist declares — the passing tree. */
function declared() {
  return ALLOWLIST.flatMap((e) => raws(e.path, e.controls));
}

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

describe('a raw control at a path nobody justified is reported', () => {
  it('flags an unexpected path', () => {
    expect(
      checkAllowlist([...declared(), ...raws('pillars/food/app/src/pages/New.tsx', 1)])
    ).toEqual([
      { kind: 'unexpected', path: 'pillars/food/app/src/pages/New.tsx', allowed: 0, now: 1 },
    ]);
  });

  it('flags it in every pillar, not only the ones that once had a baseline entry', () => {
    for (const path of [
      'pillars/lists/app/src/A.tsx',
      'pillars/finance/app/src/B.tsx',
      'pillars/cerebrum/app/src/C.tsx',
      'pillars/media/app/src/D.tsx',
      'pillars/purchases/app/src/E.tsx',
    ]) {
      expect(checkAllowlist([...declared(), ...raws(path, 1)])).toContainEqual({
        kind: 'unexpected',
        path,
        allowed: 0,
        now: 1,
      });
    }
  });

  it('reports every unexpected path, not just the first', () => {
    const findings = checkAllowlist([
      ...declared(),
      ...raws('pillars/food/app/src/A.tsx', 1),
      ...raws('pillars/lists/app/src/B.tsx', 2),
    ]);
    expect(findings.filter((f) => f.kind === 'unexpected')).toHaveLength(2);
  });
});

describe('the hole a per-pillar count could not see', () => {
  // THE reason POPS-3276 exists. Under the count baseline, removing an
  // allowlisted control and adding a raw one elsewhere in the SAME pillar
  // netted to zero and matched the pillar's entry exactly. Both halves must
  // now be reported independently.
  it('flags the swap that nets to zero within one pillar', () => {
    const designEntry = ALLOWLIST.find((e) => e.path.startsWith('pillars/design/'));
    expect(designEntry, 'fixture assumes an allowlisted design path').toBeDefined();
    const swapped = [
      ...declared().filter((v) => v.file !== designEntry?.path),
      ...raws('pillars/design/src/screens/Elsewhere.tsx', designEntry?.controls ?? 1),
    ];

    const findings = checkAllowlist(swapped);

    expect(findings).toContainEqual({
      kind: 'stale',
      path: designEntry?.path,
      allowed: designEntry?.controls,
      now: 0,
    });
    expect(findings).toContainEqual({
      kind: 'unexpected',
      path: 'pillars/design/src/screens/Elsewhere.tsx',
      allowed: 0,
      now: designEntry?.controls,
    });
  });
});

describe('an allowlisted path is held to its declared count', () => {
  it('passes on exactly what it declares', () => {
    expect(checkAllowlist(declared())).toEqual([]);
  });

  it('flags a path that grew beyond its entry — the exemption covers controls, not the file', () => {
    const entry = ALLOWLIST[0];
    expect(entry).toBeDefined();
    expect(checkAllowlist([...declared(), ...raws(entry?.path ?? '', 1)])).toEqual([
      {
        kind: 'grew',
        path: entry?.path,
        allowed: entry?.controls,
        now: (entry?.controls ?? 0) + 1,
      },
    ]);
  });

  it('flags an entry whose file no longer holds a raw control as stale', () => {
    const entry = ALLOWLIST[0];
    expect(entry).toBeDefined();
    expect(checkAllowlist(declared().filter((v) => v.file !== entry?.path))).toEqual([
      { kind: 'stale', path: entry?.path, allowed: entry?.controls, now: 0 },
    ]);
  });

  it('flags a partially paid-down entry as stale too, not only an emptied one', () => {
    const multi = ALLOWLIST.find((e) => e.controls > 1);
    expect(multi, 'fixture assumes one allowlisted file holds more than one control').toBeDefined();
    const partial = [
      ...declared().filter((v) => v.file !== multi?.path),
      ...raws(multi?.path ?? '', (multi?.controls ?? 2) - 1),
    ];
    expect(checkAllowlist(partial)).toEqual([
      {
        kind: 'stale',
        path: multi?.path,
        allowed: multi?.controls,
        now: (multi?.controls ?? 2) - 1,
      },
    ]);
  });
});

describe('the allowlist is falsifiable', () => {
  it('names a real, currently-violating path for every entry', () => {
    // An entry for a path the scanner never reports can never go stale, so it
    // would sit in the tree forever as an unspent licence.
    expect(checkAllowlist(declared())).toEqual([]);
    for (const entry of ALLOWLIST) expect(entry.controls).toBeGreaterThan(0);
  });

  it('carries a justifying ticket on every entry', () => {
    for (const entry of ALLOWLIST) {
      expect(entry.ticket, entry.path).toMatch(/^POPS-\d+$/u);
      expect(entry.reason.length, entry.path).toBeGreaterThan(20);
    }
  });

  it('agrees with ADR-051 — every allowlisted path appears in the ADR', async () => {
    const adr = await import('node:fs').then((fs) =>
      fs.readFileSync('docs/architecture/adr-051-form-controls-from-the-kit.md', 'utf8')
    );
    for (const entry of ALLOWLIST) expect(adr, entry.path).toContain(entry.path);
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

  it('passes on the real tree and says how much it looked at', () => {
    const result = proofOf(inject('realTreeProofs'), 'check-raw-form-controls');
    expect(
      result.status,
      `guard exited ${String(result.status)} against the committed allowlist — a raw form ` +
        'control landed at a path nobody justified, or an allowlisted one went stale. Run ' +
        '`pnpm check:raw-form-controls` locally to see where.' +
        `\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`
    ).toBe(0);
    const scanned = Number(/\((\d+) file\(s\) scanned\)/u.exec(result.stdout)?.[1]);
    expect(scanned).toBeGreaterThan(500);
    expect(result.stdout).toMatch(/every pillar at zero raw form controls/u);
  });

  it('runs in exactly one mode now, with nothing left to degrade to', () => {
    // The count baseline had a half that could not run without a merge base,
    // and said so on a line that was not its success line. There is no such
    // half any more; the absence is asserted so a reintroduced silent mode
    // fails here.
    const result = proofOf(inject('realTreeProofs'), 'check-raw-form-controls');
    expect(result.stdout).not.toMatch(/--base/u);
  });
});
