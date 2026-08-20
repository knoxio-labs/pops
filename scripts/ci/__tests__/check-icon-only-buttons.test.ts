/**
 * ADR-045: a guard ships with a test proving it REPORTS, not merely that it
 * passes. The tree carries no violations today, so a suite that only ran the
 * guard would be green whether or not the matcher still works. These drive
 * the pure core over source it must flag, over source it must not, and over
 * the real frontend tree — so a matcher that silently stops matching, or a
 * discovery walk that silently stops finding files, fails here.
 */

import { describe, expect, inject, it } from 'vitest';

import { findViolations, isScannable } from '../check-icon-only-buttons.mjs';
import { passingProofStdout } from './real-tree-proofs.js';

describe('an icon-only button with no aria-label is reported', () => {
  it.each(['icon', 'icon-xs', 'icon-sm', 'icon-lg'])('Button size="%s"', (size) => {
    const hits = findViolations(
      'pillars/x/app/src/A.tsx',
      `<Button size="${size}"><Trash2 /></Button>`
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.size).toBe(size);
  });

  it('reports ButtonPrimitive the same as Button', () => {
    const hits = findViolations(
      'pillars/x/app/src/A.tsx',
      '<ButtonPrimitive size="icon"><X /></ButtonPrimitive>'
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.component).toBe('ButtonPrimitive');
  });

  it('reports a title-only button — title is not a substitute for aria-label', () => {
    const hits = findViolations(
      'pillars/x/app/src/A.tsx',
      '<Button size="icon" title="Delete"><Trash2 /></Button>'
    );
    expect(hits).toHaveLength(1);
  });

  it('reports the 1-based line the opening tag starts on', () => {
    const source = [
      'function Row() {',
      '  return (',
      '    <Button size="icon">',
      '      <Trash2 />',
      '    </Button>',
      '  );',
      '}',
    ].join('\n');
    expect(findViolations('a.tsx', source)).toEqual([
      expect.objectContaining({ line: 3, component: 'Button', size: 'icon' }),
    ]);
  });

  it('does not desync on a `>` inside an attribute expression before the tag closes', () => {
    const source = [
      '<Button',
      '  size="icon-xs"',
      '  onClick={() => setOpen(x > y)}',
      '>',
      '  <Pencil />',
      '</Button>',
    ].join('\n');
    const hits = findViolations('a.tsx', source);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.size).toBe('icon-xs');
  });

  it('reports each offending button on its own line, not just the first', () => {
    const source = [
      '<Button size="icon"><Trash2 /></Button>',
      '<Button size="icon-sm"><X /></Button>',
    ].join('\n');
    expect(findViolations('a.tsx', source).map((v) => v.line)).toEqual([1, 2]);
  });

  it('reports an empty aria-label — presence is not a label', () => {
    expect(
      findViolations('a.tsx', '<Button size="icon" aria-label=""><Trash2 /></Button>')
    ).toHaveLength(1);
  });

  it('reports a whitespace-only aria-label', () => {
    expect(
      findViolations('a.tsx', '<Button size="icon" aria-label="   "><Trash2 /></Button>')
    ).toHaveLength(1);
  });

  it('reports aria-label={undefined} — it renders with no attribute at all', () => {
    expect(
      findViolations('a.tsx', '<Button size="icon" aria-label={undefined}><Trash2 /></Button>')
    ).toHaveLength(1);
  });

  it('reports data-aria-label as a decoy, not a real aria-label', () => {
    expect(
      findViolations('a.tsx', '<Button size="icon" data-aria-label="x"><Trash2 /></Button>')
    ).toHaveLength(1);
  });

  it('reports a ternary aria-label with an empty-string "else" branch', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={isEditing ? "Save" : ""}><Trash2 /></Button>'
      )
    ).toHaveLength(1);
  });

  it('reports the reversed ternary — empty-string branch first', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={isEditing ? "" : "Save"}><Trash2 /></Button>'
      )
    ).toHaveLength(1);
  });

  it('reports a ternary aria-label with an undefined branch', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={isEditing ? undefined : "Save"}><Trash2 /></Button>'
      )
    ).toHaveLength(1);
  });

  it('reports cond && "Label" — the left side has an always-reachable falsy path', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={cond && "Close"}><Trash2 /></Button>'
      )
    ).toHaveLength(1);
  });

  it('reports x ?? "" — an unresolvable left with a decidably-empty right', () => {
    expect(
      findViolations('a.tsx', '<Button size="icon" aria-label={x ?? ""}><Trash2 /></Button>')
    ).toHaveLength(1);
  });

  it('reports a nested ternary with a buried empty-string branch', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={a ? (b ? "Save" : "") : "Close"}><Trash2 /></Button>'
      )
    ).toHaveLength(1);
  });

  it("reports size={'icon'} — a brace-wrapped string literal is statically decidable", () => {
    const hits = findViolations('a.tsx', "<Button size={'icon'}><Trash2 /></Button>");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.size).toBe('icon');
  });

  it('reports `x || ""` — the fallback is a decidable empty literal', () => {
    expect(
      findViolations('a.tsx', '<Button size="icon" aria-label={x || ""}><Trash2 /></Button>')
    ).toHaveLength(1);
  });

  it('reports `x || undefined` — the "omit the attribute when falsy" idiom', () => {
    expect(
      findViolations('a.tsx', '<Button size="icon" aria-label={x || undefined}><Trash2 /></Button>')
    ).toHaveLength(1);
  });

  it('reports a ternary branch that is itself `x || ""`', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={cond ? (x || "") : "Save"}><Trash2 /></Button>'
      )
    ).toHaveLength(1);
  });

  it('reports a chained `a || b || ""`', () => {
    expect(
      findViolations('a.tsx', '<Button size="icon" aria-label={a || b || ""}><Trash2 /></Button>')
    ).toHaveLength(1);
  });

  it('reports `||` whose left is a parenthesised `??` expression', () => {
    expect(
      findViolations('a.tsx', '<Button size="icon" aria-label={(x ?? y) || ""}><Trash2 /></Button>')
    ).toHaveLength(1);
  });

  it('reports a ternary branch that is a template literal with interpolation', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={cond ? `${x}` : ""}><Trash2 /></Button>'
      )
    ).toHaveLength(1);
  });

  it('reports a ternary branch that is a template literal without interpolation', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={cond ? `static text` : ""}><Trash2 /></Button>'
      )
    ).toHaveLength(1);
  });

  it("reports a ternary branch that is a template nested inside another template's interpolation", () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={cond ? `${`${y}`}` : ""}><Trash2 /></Button>'
      )
    ).toHaveLength(1);
  });

  it('reports a ternary branch that is a string literal containing a brace', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={cond ? "{}" : ""}><Trash2 /></Button>'
      )
    ).toHaveLength(1);
  });

  it('reports a ternary branch that is a call with an object-literal argument', () => {
    expect(
      findViolations(
        'a.tsx',
        "<Button size=\"icon\" aria-label={cond ? t({ key: 'x' }) : ''}><Trash2 /></Button>"
      )
    ).toHaveLength(1);
  });
});

describe('a labelled or non-icon button is not reported', () => {
  it('an icon-only Button WITH aria-label is clean', () => {
    expect(
      findViolations('a.tsx', '<Button size="icon" aria-label="Delete item"><Trash2 /></Button>')
    ).toHaveLength(0);
  });

  it('an icon-only ButtonPrimitive WITH aria-label is clean', () => {
    expect(
      findViolations(
        'a.tsx',
        '<ButtonPrimitive size="icon-sm" aria-label="Close"><X /></ButtonPrimitive>'
      )
    ).toHaveLength(0);
  });

  it('a prominent icon+text button (default size) is clean', () => {
    expect(findViolations('a.tsx', '<Button><Plus /> Add Item</Button>')).toHaveLength(0);
  });

  it('a non-icon size is clean regardless of aria-label', () => {
    expect(findViolations('a.tsx', '<Button size="sm">Save</Button>')).toHaveLength(0);
  });

  it('a dynamic size expression is not guessed at', () => {
    expect(findViolations('a.tsx', '<Button size={dynamicSize}><Trash2 /></Button>')).toHaveLength(
      0
    );
  });

  it("size={'icon'} with a real aria-label is not a violation", () => {
    expect(
      findViolations('a.tsx', '<Button size={\'icon\'} aria-label="Delete"><Trash2 /></Button>')
    ).toHaveLength(0);
  });

  it('aria-labelledby with a static value satisfies the guard', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-labelledby="delete-heading"><Trash2 /></Button>'
      )
    ).toHaveLength(0);
  });

  it('aria-labelledby with a dynamic value satisfies the guard', () => {
    expect(
      findViolations('a.tsx', '<Button size="icon" aria-labelledby={headingId}><Trash2 /></Button>')
    ).toHaveLength(0);
  });

  it('a dynamic aria-label expression is treated as present, not guessed at', () => {
    expect(
      findViolations('a.tsx', '<Button size="icon" aria-label={computedLabel}><Trash2 /></Button>')
    ).toHaveLength(0);
  });

  it('a ternary aria-label with two decidably non-empty branches is clean', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={isEditing ? "Save" : "Edit"}><Trash2 /></Button>'
      )
    ).toHaveLength(0);
  });

  it('"Close" && "Delete" is clean — the left is a decidably-truthy literal', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={"Close" && "Delete"}><Trash2 /></Button>'
      )
    ).toHaveLength(0);
  });

  it('labelA ?? "Close" is clean — an unresolvable left with a non-empty right is fail-open', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={labelA ?? "Close"}><Trash2 /></Button>'
      )
    ).toHaveLength(0);
  });

  it('a ternary unresolvable on both branches is fail-open, deliberately', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={cond ? labelA : labelB}><Trash2 /></Button>'
      )
    ).toHaveLength(0);
  });

  it('a plain native <button> is out of scope for this guard', () => {
    expect(
      findViolations('a.tsx', '<button className="icon-button"><Trash2 /></button>')
    ).toHaveLength(0);
  });

  it('`cond || "Close"` is clean — the fallback genuinely labels the button', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={cond || "Close"}><Trash2 /></Button>'
      )
    ).toHaveLength(0);
  });

  it('`"Close" || x` is clean — a decidably-truthy left short-circuits the whole expression', () => {
    expect(
      findViolations('a.tsx', '<Button size="icon" aria-label={"Close" || x}><Trash2 /></Button>')
    ).toHaveLength(0);
  });

  it('a ternary with a template-literal-with-interpolation branch and a real other branch is clean', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={cond ? `${x}` : "Close"}><Trash2 /></Button>'
      )
    ).toHaveLength(0);
  });

  it('a ternary with a brace-containing string literal branch and a real other branch is clean', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={cond ? "{}" : "Close"}><Trash2 /></Button>'
      )
    ).toHaveLength(0);
  });

  it('an object-literal call argument as an aria-label value (unresolvable, fail-open) is clean', () => {
    expect(
      findViolations(
        'a.tsx',
        '<Button size="icon" aria-label={t({ key: \'x\' })}><Trash2 /></Button>'
      )
    ).toHaveLength(0);
  });
});

describe('isScannable', () => {
  it('scans app and lib .tsx source', () => {
    expect(isScannable('pillars/food/app/src/pages/X.tsx')).toBe(true);
    expect(isScannable('libs/ui/src/components/Foo.tsx')).toBe(true);
  });

  it('exempts stories, tests, __tests__, generated clients, and non-.tsx files', () => {
    expect(isScannable('libs/ui/src/primitives/Badge.stories.tsx')).toBe(false);
    expect(isScannable('pillars/food/app/src/pages/X.test.tsx')).toBe(false);
    expect(isScannable('libs/ui/src/__tests__/x.tsx')).toBe(false);
    expect(isScannable('pillars/food/app/src/lists-api/types.gen.tsx')).toBe(false);
    expect(isScannable('pillars/food/app/src/pages/X.ts')).toBe(false);
  });
});

describe('the guard proves itself', () => {
  it('passes its own --self-test', () => {
    const output = passingProofStdout(
      inject('realTreeProofs'),
      'check-icon-only-buttons:self-test'
    );
    expect(output).toMatch(/self-test OK/u);
  });

  it('passes on the real tree and says how much it looked at', () => {
    const stdout = passingProofStdout(inject('realTreeProofs'), 'check-icon-only-buttons');
    const scanned = Number(/Scanned (\d+) \.tsx file/.exec(stdout)?.[1]);
    expect(scanned).toBeGreaterThan(200);
    expect(stdout).toMatch(/OK — every icon-only/u);
  });
});
