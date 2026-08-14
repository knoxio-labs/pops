import { describe, expect, it } from 'vitest';

import { diffAgainstBaseline, findViolations, isScannable } from '../check-touch-targets.mjs';

describe('findViolations', () => {
  it('flags a raw button with no sizing evidence', () => {
    const src = ['<button type="button" onClick={onClick}>', '  Save', '</button>'].join('\n');
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
      { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
    ]);
  });

  it('flags a raw anchor with no sizing evidence', () => {
    const src = '<a href="/x" className="text-sm underline">link</a>';
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
      { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'a' },
    ]);
  });

  it('does not flag a button sized via a direct size-11/min-h-11+min-w-11 utility', () => {
    const src = [
      '<button className="size-11" onClick={onClick}><XIcon /></button>',
      '<a href="/x" className="min-w-11 min-h-11 flex items-center">link</a>',
    ].join('\n');
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
  });

  it('still flags a button sized on only one axis (h-11 with no w evidence)', () => {
    const src = '<button className="h-11 px-4" onClick={onClick}>Save</button>';
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
      { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
    ]);
  });

  it('does not flag a button sized via an arbitrary >=44px pixel value', () => {
    const src = '<a href="/x" className="min-w-[44px] min-h-[48px] flex items-center">link</a>';
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
  });

  it('does not flag a compact button using the before:-inset-* expansion pattern, sized against its own box', () => {
    const src =
      '<button className="relative h-6 w-6 before:absolute before:-inset-2.5 before:content-[\'\']">x</button>';
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
  });

  it('does not flag a sub-44px utility (h-8, size-9) with no other sizing evidence', () => {
    const src = '<button className="h-8 w-8" onClick={onClick}><XIcon /></button>';
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
      { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
    ]);
  });

  it.each([
    ['a margin that happens to be >=44px', 'h-6 w-6 mt-[80px]'],
    ['a position offset that happens to be >=44px', 'h-6 w-6 top-[44px]'],
    ['a width CAP, which bounds the box rather than sizing it', 'h-6 w-6 max-w-24'],
    ['a fraction width, which is a proportion of the parent', 'h-6 w-11/12'],
  ])('does not accept %s as sizing evidence', (_label, className) => {
    const src = `<button className="${className}"><XIcon /></button>`;
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
      { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
    ]);
  });

  it.each([
    ['an arbitrary sizing value on the min- form on both axes', 'min-h-[44px] min-w-[44px]'],
    ['a three-digit spacing step', 'size-100'],
    ['an arbitrary rem value equal to 44px on both axes', 'h-[2.75rem] w-[2.75rem]'],
  ])('still accepts %s', (_label, className) => {
    const src = `<button className="${className}"><XIcon /></button>`;
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
  });

  it.each([
    ['a variant-prefixed height with no width evidence', 'sm:h-11 w-6'],
    ['an arbitrary min-height with no width evidence', 'min-h-[44px]'],
    ['max-h, which caps the box rather than sizing it, paired with a real width', 'max-h-11 w-11'],
  ])('does not accept %s', (_label, className) => {
    const src = `<button className="${className}"><XIcon /></button>`;
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
      { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
    ]);
  });

  describe('breakpoint-prefixed sizing', () => {
    it.each([
      ['a bare sm: on both axes', 'sm:h-11 sm:w-11'],
      ['a bare md: on both axes', 'md:h-11 md:w-11'],
      ['a bare lg: on both axes', 'lg:h-11 lg:w-11'],
      ['a bare xl: on both axes', 'xl:h-11 xl:w-11'],
      ['a bare 2xl: on both axes', '2xl:h-11 2xl:w-11'],
      ['an arbitrary min-width variant on both axes', 'min-[640px]:h-11 min-[640px]:w-11'],
    ])(
      'flags %s as a violation — it only applies ABOVE that width, not on the phone-width base',
      (_label, className) => {
        const src = `<button className="${className}"><XIcon /></button>`;
        expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
          { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
        ]);
      }
    );

    it('flags a sub-44px base grown only by a breakpoint variant (base is what a phone renders)', () => {
      const src = '<button className="h-6 w-6 sm:h-11 sm:w-11"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it.each([
      ['a bare max-sm: on both axes', 'max-sm:h-11 max-sm:w-11'],
      ['a bare max-md: on both axes', 'max-md:h-11 max-md:w-11'],
      ['an arbitrary max-width variant on both axes', 'max-[640px]:h-11 max-[640px]:w-11'],
    ])(
      'flags %s as a violation — it applies only BELOW that width, so every width at and above it (tablets, touch laptops) is unsized',
      (_label, className) => {
        const src = `<button className="${className}"><XIcon /></button>`;
        expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
          { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
        ]);
      }
    );

    it('flags an undersized unprefixed base laundered by a max-sm: variant (36px at every width >= 640px)', () => {
      const src = '<button className="h-9 w-9 max-sm:h-11 max-sm:w-11"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it.each([
      [
        'the long-hand arbitrary min-width media form',
        '[@media(min-width:640px)]:h-11 [@media(min-width:640px)]:w-11',
      ],
      [
        'the long-hand arbitrary max-width media form',
        '[@media(max-width:640px)]:h-11 [@media(max-width:640px)]:w-11',
      ],
      ['CSS range syntax, <=', '[@media(width<=640px)]:h-11 [@media(width<=640px)]:w-11'],
      ['CSS range syntax, >=', '[@media(width>=640px)]:h-11 [@media(width>=640px)]:w-11'],
      [
        'CSS two-sided range syntax',
        '[@media(400px<=width<=700px)]:h-11 [@media(400px<=width<=700px)]:w-11',
      ],
      [
        'the underscore-for-space arbitrary spelling',
        '[@media_(min-width:640px)]:h-11 [@media_(min-width:640px)]:w-11',
      ],
    ])(
      'flags %s as a violation — it is a breakpoint variant written out, not evidence',
      (_label, className) => {
        const src = `<button className="${className}"><XIcon /></button>`;
        expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
          { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
        ]);
      }
    );

    it('flags a same-axis shrink hidden behind a CSS range media variant, not just base evidence', () => {
      const src =
        '<button className="h-11 w-11 [@media(width<=600px)]:h-6 [@media(width<=600px)]:w-6"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it('accepts a sufficient unprefixed base grown further by a min-width breakpoint variant', () => {
      const src = '<button className="h-11 w-11 sm:h-16 sm:w-16"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
    });

    it('accepts a sufficient unprefixed base grown further by a max-width breakpoint variant', () => {
      const src = '<button className="h-11 w-11 max-sm:h-16 max-sm:w-16"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
    });

    it('does not let breakpoint-prefixed evidence launder an undersized before:-inset-* expansion', () => {
      const src = '<button className="h-6 w-6 sm:before:-inset-9"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it('does not let a max-sm:-gated before:-inset-* expansion launder an undersized base either', () => {
      const src =
        '<button className="relative h-6 w-6 max-sm:before:absolute max-sm:before:-inset-9">x</button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });
  });

  describe('a viewport-width variant shrinking an already-sufficient base', () => {
    it.each([
      ['max-sm: below 640px', 'h-11 w-11 max-sm:h-6 max-sm:w-6'],
      ['sm: at/above 640px — the mirror direction', 'h-11 w-11 sm:h-6 sm:w-6'],
      ['an arbitrary max-[…]: bound', 'h-11 w-11 max-[600px]:h-6 max-[600px]:w-6'],
      [
        'the long-hand arbitrary max-width media form',
        'h-11 w-11 [@media(max-width:600px)]:h-6 [@media(max-width:600px)]:w-6',
      ],
      ['a stacked max-sm:hover: variant', 'h-11 w-11 max-sm:hover:h-6 max-sm:hover:w-6'],
      ['max-sm:size-* shrinking both axes via one utility', 'h-11 w-11 max-sm:size-6'],
    ])(
      'flags a sufficient base shrunk below the floor by %s, even though the unprefixed base alone would pass',
      (_label, className) => {
        const src = `<button className="${className}"><XIcon /></button>`;
        expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
          { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
        ]);
      }
    );

    it('does not flag a scoped variant whose magnitude equals the floor exactly', () => {
      const src = '<button className="h-11 w-11 max-sm:h-11 max-sm:w-11"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
    });

    it('does not flag a scoped variant that only grows the base further', () => {
      const src = '<button className="h-11 w-11 max-sm:h-16 max-sm:w-16"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
    });
  });

  describe('scoped min-/max- direction (a min- floor cannot shrink; a max- ceiling can)', () => {
    it.each([
      ['sm: direction', 'h-11 w-11 sm:min-w-0'],
      ['max-sm: direction', 'h-11 w-11 max-sm:min-w-0'],
      ['min-h on the other axis', 'h-11 w-11 sm:min-h-0'],
    ])(
      'does not flag a scoped min- utility as a shrink (%s) — it is a floor, a no-op',
      (_label, className) => {
        const src = `<button className="${className}"><XIcon /></button>`;
        expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
      }
    );

    it('still flags an unscoped min-w-0 with no other width evidence (control)', () => {
      const src = '<button className="h-11 min-w-0"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it.each([
      ['sm: direction', 'h-11 w-11 sm:max-h-6 sm:max-w-6'],
      ['max-sm: direction', 'h-11 w-11 max-sm:max-h-6 max-sm:max-w-6'],
    ])(
      'flags a scoped max- utility as a real shrink (%s) — a ceiling caps the rendered box',
      (_label, className) => {
        const src = `<button className="${className}"><XIcon /></button>`;
        expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
          { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
        ]);
      }
    );

    it('does not flag a scoped max- utility whose magnitude is still >= 44px', () => {
      const src = '<button className="h-11 w-11 sm:max-h-16 sm:max-w-16"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
    });
  });

  describe('container-query and other non-viewport-width variants', () => {
    it.each([
      ['@sm:', '@sm:h-11 @sm:w-11'],
      ['@md:', '@md:h-11 @md:w-11'],
      ['@min-[400px]:', '@min-[400px]:h-11 @min-[400px]:w-11'],
    ])('flags %s as a violation, same as its non-container form', (_label, className) => {
      const src = `<button className="${className}"><XIcon /></button>`;
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it.each([
      ['dark:', 'dark:h-11 dark:w-11'],
      ['hover:', 'hover:h-11 hover:w-11'],
      ['print:', 'print:h-11 print:w-11'],
      ['landscape:', 'landscape:h-11 landscape:w-11'],
      ['data-[k=v]:', 'data-[k=v]:h-11 data-[k=v]:w-11'],
    ])('accepts %s as evidence — it is not viewport-width scoped', (_label, className) => {
      const src = `<button className="${className}"><XIcon /></button>`;
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
    });

    it.each([
      ['sm:hover:', 'sm:hover:h-11 sm:hover:w-11'],
      ['hover:sm:', 'hover:sm:h-11 hover:sm:w-11'],
      ['sm:max-md:', 'sm:max-md:h-11 sm:max-md:w-11'],
      ['min-[600px]:', 'min-[600px]:h-11 min-[600px]:w-11'],
    ])('flags stacked/arbitrary variant %s as a violation', (_label, className) => {
      const src = `<button className="${className}"><XIcon /></button>`;
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });
  });

  describe('evidence holes: sibling laundering, undersized inset, single-axis proof', () => {
    it("does not let a sibling element launder an undersized control (evidence scoped to the element's own tag)", () => {
      const src = [
        '<a className="block break-all text-sm text-primary underline">link</a>',
        '<iframe className="h-96 w-full" />',
      ].join('\n');
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'a' },
      ]);
    });

    it('does not let a sibling on a distant line launder an undersized control either', () => {
      const src = [
        '<a className="block break-all text-sm text-primary underline">',
        '  link',
        '</a>',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '<iframe className="h-96 w-full" />',
      ].join('\n');
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'a' },
      ]);
    });

    it('does not accept a before:-inset-* expansion too small to reach 44px given its own box', () => {
      const src = '<button className="h-6 w-6 before:-inset-0.5"><X /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it('does not accept a before:-inset-* expansion with no box evidence at all', () => {
      const src = '<button className="before:-inset-2.5"><X /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it('does not accept width alone as proof of both axes', () => {
      const src = '<a href="/x" className="w-64 text-sm underline">link</a>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'a' },
      ]);
    });
  });

  it('does not mistake a component tag for a raw element (case-sensitive)', () => {
    const src = [
      '<ButtonPrimitive onClick={onClick}>Save</ButtonPrimitive>',
      '<AliasTargetPicker onSelect={onSelect} />',
      '<article>content</article>',
    ].join('\n');
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
  });

  it('does not flag a raw element mentioned only in a comment or docstring', () => {
    const src = [
      '/**',
      ' * Match the `href` attribute on an `<a>` rendered by react-markdown.',
      ' */',
      '// falls through to a default <button> in that case',
      'export function noop() {}',
    ].join('\n');
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
  });

  it('finds sizing evidence spread across a multi-line opening tag', () => {
    const src = [
      '<button',
      '  type="button"',
      '  className="size-11"',
      '  onClick={onClick}',
      '>',
      '  <XIcon />',
      '</button>',
    ].join('\n');
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
  });

  it('does not end the opening tag early on a `>` inside a JSX expression attribute', () => {
    const src = '<button className="size-11" onClick={() => count > 0}><XIcon /></button>';
    expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
  });

  it('reports the correct 1-indexed line for each match, not just the first', () => {
    const src = [
      'export function Toolbar() {',
      '  return (',
      '    <div>',
      '      <button type="button" onClick={a}>A</button>',
      '      <button type="button" onClick={b}>B</button>',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    const lines = findViolations('pillars/x/app/src/A.tsx', src).map((v) => v.line);
    expect(lines).toEqual([4, 5]);
  });
});

describe('isScannable', () => {
  it('scans a pillar app page', () => {
    expect(isScannable('pillars/food/app/src/pages/X.tsx')).toBe(true);
  });

  it('scans the shell', () => {
    expect(isScannable('pillars/shell/src/App.tsx')).toBe(true);
  });

  it('excludes a plain .ts file — JSX cannot appear there', () => {
    expect(isScannable('pillars/food/app/src/components/Helpers.ts')).toBe(false);
  });

  it('excludes stories, tests and specs', () => {
    expect(isScannable('pillars/food/app/src/pages/X.stories.tsx')).toBe(false);
    expect(isScannable('pillars/food/app/src/pages/X.test.tsx')).toBe(false);
    expect(isScannable('pillars/food/app/src/pages/X.spec.tsx')).toBe(false);
  });

  it('excludes __tests__, __mocks__ and e2e directories', () => {
    expect(isScannable('pillars/food/app/src/__tests__/x.tsx')).toBe(false);
    expect(isScannable('pillars/food/app/src/__mocks__/x.tsx')).toBe(false);
    expect(isScannable('pillars/shell/e2e/x.tsx')).toBe(false);
  });

  it('excludes a generated per-consumer client', () => {
    expect(isScannable('pillars/food/app/src/lists-api/types.gen.tsx')).toBe(false);
  });

  it('excludes a non-source file', () => {
    expect(isScannable('pillars/food/README.md')).toBe(false);
  });
});

describe('diffAgainstBaseline', () => {
  const baseline = {
    'pillars/food/app/src/a.tsx': { button: 2 },
    'pillars/shell/src/b.tsx': { a: 1 },
  };

  it('passes an unchanged tree', () => {
    expect(diffAgainstBaseline(baseline, baseline)).toEqual([]);
  });

  it('passes when violations shrink', () => {
    const shrunk = { 'pillars/food/app/src/a.tsx': { button: 1 } };
    expect(diffAgainstBaseline(shrunk, baseline)).toEqual([]);
  });

  it('flags a brand-new file carrying a violation', () => {
    const grown = { ...baseline, 'pillars/food/app/src/new.tsx': { button: 1 } };
    expect(diffAgainstBaseline(grown, baseline)).toContainEqual({
      file: 'pillars/food/app/src/new.tsx',
      kind: 'button',
      was: 0,
      now: 1,
    });
  });

  it('flags a new kind appearing in an already-baselined file', () => {
    const grown = {
      ...baseline,
      'pillars/shell/src/b.tsx': { a: 1, button: 1 },
    };
    expect(diffAgainstBaseline(grown, baseline)).toContainEqual({
      file: 'pillars/shell/src/b.tsx',
      kind: 'button',
      was: 0,
      now: 1,
    });
  });

  it('flags a grown count for an existing (file, kind)', () => {
    const grown = { ...baseline, 'pillars/food/app/src/a.tsx': { button: 3 } };
    expect(diffAgainstBaseline(grown, baseline)).toContainEqual({
      file: 'pillars/food/app/src/a.tsx',
      kind: 'button',
      was: 2,
      now: 3,
    });
  });
});
