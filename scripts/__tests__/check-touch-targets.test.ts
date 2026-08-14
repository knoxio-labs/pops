import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { diffAgainstBaseline, findViolations, isScannable } from '../check-touch-targets.mjs';

const here = dirname(fileURLToPath(import.meta.url));

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

    describe('a media TYPE named ahead of the feature list (POPS-2253)', () => {
      it.each([
        [
          'screen and',
          '[@media_screen_and_(min-width:640px)]:h-11 [@media_screen_and_(min-width:640px)]:w-11',
        ],
        [
          'only screen and',
          '[@media_only_screen_and_(min-width:640px)]:h-11 [@media_only_screen_and_(min-width:640px)]:w-11',
        ],
        [
          'all and',
          '[@media_all_and_(min-width:640px)]:h-11 [@media_all_and_(min-width:640px)]:w-11',
        ],
      ])(
        'flags %s — it is still a viewport-width variant, not unprefixed base evidence',
        (_label, className) => {
          const src = `<button className="${className}"><XIcon /></button>`;
          expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
            { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
          ]);
        }
      );

      it('flags a sufficient base shrunk by a media-type-prefixed max-width query', () => {
        const src =
          '<button className="h-11 w-11 [@media_screen_and_(max-width:600px)]:h-6 [@media_screen_and_(max-width:600px)]:w-6"><XIcon /></button>';
        expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
          { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
        ]);
      });
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

  describe('a scoped before:-inset-* variant combined with the box regime it actually governs (POPS-2255)', () => {
    it('flags an unprefixed box shrunk to 24px by a same-scope inset collapse (the real violation)', () => {
      const src =
        '<button className="h-6 w-6 before:-inset-9 max-sm:before:-inset-0"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it('does not flag a compact box + inset expansion below a breakpoint, resized to a real 44px box at/above it', () => {
      const src =
        '<button className="h-6 w-6 before:-inset-9 sm:h-11 sm:w-11 sm:before:-inset-0"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
    });

    it('does not flag the max-sm: mirror of the same idiom', () => {
      const src =
        '<button className="h-11 w-11 max-sm:h-6 max-sm:w-6 max-sm:before:-inset-9"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
    });

    it('still flags when the resized regime box is itself insufficient even paired with its own inset', () => {
      const src =
        '<button className="h-6 w-6 before:-inset-9 sm:h-8 sm:w-8 sm:before:-inset-0"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });
  });

  describe('two overlapping viewport-width regimes at once, not just one regime plus the base (POPS-2263)', () => {
    it('flags md borrowing the unprefixed base instead of the wider sm regime for the box it does not set itself', () => {
      // At >= 768px, sm (24px box) is still live alongside md (0px inset).
      // Combining md's own inset with sm's own box gives a real 24px control;
      // combining it with the unprefixed base's 44px box would wrongly pass.
      const src =
        '<button className="h-11 w-11 sm:h-6 sm:w-6 sm:before:-inset-9 md:before:-inset-0"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it('flags the inset-side mirror: md sets its own box but must borrow its inset from sm, not the unprefixed one', () => {
      const src =
        '<button className="h-6 w-6 before:-inset-9 sm:h-11 sm:w-11 sm:before:-inset-0 md:h-6 md:w-6"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it('flags the max-width mirror: max-sm must borrow its box from max-md (the nearest wider max-width regime)', () => {
      const src =
        '<button className="h-11 w-11 max-md:h-6 max-md:w-6 max-md:before:-inset-9 max-sm:before:-inset-0"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it('fails closed on an unorderable two-sided arbitrary range overlapping a named min-width regime', () => {
      // [@media(400px<=width<=700px)] cannot be cheaply proven a superset or
      // subset of sm — sm sets the box, so the range's own box is unresolved
      // and must flag rather than silently trust the unprefixed base.
      const src =
        '<button className="h-11 w-11 sm:h-6 sm:w-6 sm:before:-inset-9 [@media(400px<=width<=700px)]:before:-inset-0"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it('does not flag two min-width regimes that only ever grow the box further', () => {
      const src =
        '<button className="h-11 w-11 sm:h-16 sm:w-16 md:h-20 md:w-20"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
    });

    it('does not flag when the cascade genuinely rescues compliance: md borrows a real 44px box from sm', () => {
      const src =
        '<button className="h-6 w-6 before:-inset-9 sm:h-11 sm:w-11 sm:before:-inset-0 md:before:-inset-0"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
    });

    it('does not flag the max-width mirror of the cascade rescue', () => {
      const src =
        '<button className="h-11 w-11 max-md:h-6 max-md:w-6 max-md:before:-inset-9 max-sm:before:-inset-9"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
    });
  });

  describe('a scoped before:-inset-x-*/-inset-y-* per-axis variant (POPS-2256)', () => {
    it('flags a scoped before:-inset-x-* collapsing only the WIDTH expansion below a breakpoint', () => {
      const src =
        '<button className="h-6 w-6 before:-inset-9 max-sm:before:-inset-x-0"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it('flags a scoped before:-inset-y-* collapsing only the HEIGHT expansion below a breakpoint', () => {
      const src =
        '<button className="h-6 w-6 before:-inset-9 max-sm:before:-inset-y-0"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it('accepts an unprefixed before:-inset-x-* + before:-inset-y-* pair as real per-axis base evidence', () => {
      const src =
        '<button className="h-6 w-6 before:-inset-x-9 before:-inset-y-9"><XIcon /></button>';
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

  describe('an unprefixed base max-h-*/max-w-* ceiling is a real shrink too, not just the scoped form (POPS-2265)', () => {
    it('flags a base max-h/max-w ceiling below 44 with no variant at all', () => {
      const src = '<button className="h-11 w-11 max-h-6 max-w-6"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it('flags a base max-size ceiling below 44 capping both axes at once', () => {
      const src = '<button className="h-11 w-11 max-size-6"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
    });

    it('does not flag a base max-h/max-w ceiling whose magnitude is still >= 44px', () => {
      const src = '<button className="h-11 w-11 max-h-16 max-w-16"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([]);
    });

    it('does not let a base max-h/max-w ceiling with no underlying h/w evidence stand in as a box on its own', () => {
      const src = '<button className="max-h-16 max-w-16"><XIcon /></button>';
      expect(findViolations('pillars/x/app/src/A.tsx', src)).toEqual([
        { file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' },
      ]);
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

describe('BREAKPOINT_NAMES: Tailwind v4 defaults union with globals.css (POPS-2254)', () => {
  /**
   * `--breakpoint-*` names are read at module load, so proving the union
   * holds even when `globals.css` declares only a custom breakpoint needs a
   * real module instance loaded against a synthetic root — importing the
   * already-loaded `../check-touch-targets.mjs` again would just return the
   * cached module keyed to THIS repo's `globals.css`.
   */
  it('still flags sm:h-11 sm:w-11 with no unprefixed base when globals.css declares only a custom breakpoint', async () => {
    const root = mkdtempSync(join(tmpdir(), 'touch-target-breakpoint-union-'));
    try {
      mkdirSync(join(root, 'scripts'), { recursive: true });
      mkdirSync(join(root, 'libs/ui/src/theme'), { recursive: true });
      copyFileSync(
        join(here, '../check-touch-targets.mjs'),
        join(root, 'scripts/check-touch-targets.mjs')
      );
      writeFileSync(
        join(root, 'libs/ui/src/theme/globals.css'),
        '@theme {\n  --breakpoint-phone: 480px;\n}\n'
      );

      const mod = await import(
        `${pathToFileURL(join(root, 'scripts/check-touch-targets.mjs')).href}?union=${Date.now()}`
      );
      const hits = mod.findViolations(
        'pillars/x/app/src/A.tsx',
        '<button className="sm:h-11 sm:w-11"><XIcon /></button>'
      );
      expect(hits).toEqual([{ file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('BREAKPOINT_NAMES: a hyphenated custom breakpoint name is captured whole (POPS-2264)', () => {
  /**
   * Same sandboxed-module reasoning as the POPS-2254 suite above: the name
   * capture must span the hyphen in `--breakpoint-tablet-lg`, not stop at
   * `tablet` and miss the `:` that would have proven it a real declaration.
   */
  it('flags tablet-lg: (min-width) with no unprefixed base, and max-tablet-lg: shrinking a sufficient base', async () => {
    const root = mkdtempSync(join(tmpdir(), 'touch-target-hyphenated-breakpoint-'));
    try {
      mkdirSync(join(root, 'scripts'), { recursive: true });
      mkdirSync(join(root, 'libs/ui/src/theme'), { recursive: true });
      copyFileSync(
        join(here, '../check-touch-targets.mjs'),
        join(root, 'scripts/check-touch-targets.mjs')
      );
      writeFileSync(
        join(root, 'libs/ui/src/theme/globals.css'),
        '@theme {\n  --breakpoint-tablet-lg: 900px;\n}\n'
      );

      const mod = await import(
        `${pathToFileURL(join(root, 'scripts/check-touch-targets.mjs')).href}?hyphen=${Date.now()}`
      );
      const minHits = mod.findViolations(
        'pillars/x/app/src/A.tsx',
        '<button className="tablet-lg:h-11 tablet-lg:w-11"><XIcon /></button>'
      );
      expect(minHits).toEqual([{ file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' }]);

      const maxHits = mod.findViolations(
        'pillars/x/app/src/A.tsx',
        '<button className="h-11 w-11 max-tablet-lg:h-6 max-tablet-lg:w-6"><XIcon /></button>'
      );
      expect(maxHits).toEqual([{ file: 'pillars/x/app/src/A.tsx', line: 1, tag: 'button' }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
