import { describe, expect, it } from 'vitest';

import { assessCoverage, formatCoverage, readCoverage, readRows } from '../huly-coverage.mjs';
import { DEFAULT_LIMIT, describeCell } from '../huly-partition.mjs';

type Cell = Parameters<typeof describeCell>[0];
type Coverage = NonNullable<Parameters<typeof assessCoverage>[0]>;
type CoverageCell = Coverage['cells'][number];

const cell = (filter: Cell, count: number): CoverageCell => ({ filter, count });
const issues = (...identifiers: string[]) => identifiers.map((identifier) => ({ identifier }));

const coverageOf = (
  cells: CoverageCell[],
  statuses: string[],
  components?: string[]
): Coverage => ({
  limit: DEFAULT_LIMIT,
  statuses,
  ...(components === undefined ? {} : { components }),
  cells,
});

describe('assessCoverage — the complete case', () => {
  it('accepts a single under-cap query per status', () => {
    const verdict = assessCoverage(
      coverageOf(
        [cell({ status: 'Backlog' }, 2), cell({ status: 'Done' }, 1)],
        ['Backlog', 'Done']
      ),
      issues('POPS-1', 'POPS-2', 'POPS-3')
    );
    expect(verdict.complete).toBe(true);
    expect(verdict.problems).toEqual([]);
    expect(verdict.declaredTotal).toBe(3);
  });

  it('accepts a refined status whose leaves tile it', () => {
    const verdict = assessCoverage(
      coverageOf(
        [
          cell({ status: 'Merged', hasComponent: true }, 1),
          cell({ status: 'Merged', hasComponent: false, hasAssignee: true }, 1),
          cell({ status: 'Merged', hasComponent: false, hasAssignee: false }, 1),
        ],
        ['Merged']
      ),
      issues('POPS-1', 'POPS-2', 'POPS-3')
    );
    expect(verdict.complete).toBe(true);
  });

  it('says so in words a reader can act on', () => {
    const verdict = assessCoverage(
      coverageOf([cell({ status: 'Backlog' }, 1)], ['Backlog']),
      issues('POPS-1')
    );
    expect(formatCoverage(verdict)).toEqual([expect.stringContaining('COVERAGE: complete')]);
  });
});

describe('assessCoverage — the title axis, which it cannot verify', () => {
  const titleCoverage = coverageOf(
    [
      cell({ status: 'Merged', titleRegex: '[a-m]%' }, 1),
      cell({ status: 'Merged', titleRegex: '[^a-m]%' }, 1),
    ],
    ['Merged']
  );

  it('accepts the branch without pretending it was checked', () => {
    const verdict = assessCoverage(titleCoverage, issues('POPS-1', 'POPS-2'));
    expect(verdict.complete).toBe(true);
    expect(verdict.uncovered).toEqual([]);
    expect(verdict.assumptions).toHaveLength(1);
  });

  // The whole risk of the title axis is that it reads as proof. The headline
  // has to be different from the fully-verified one, and the assumption has to
  // appear in the output rather than only in a field nobody prints.
  it('does not let it read as a fully verified sweep', () => {
    const text = formatCoverage(assessCoverage(titleCoverage, issues('POPS-1', 'POPS-2'))).join(
      '\n'
    );
    expect(text).toContain('complete on every axis it can verify');
    expect(text).toContain('ASSUMED, not verified');
    expect(text).toContain('[a-m]%');
  });

  it('still refuses a title cell that reached the cap', () => {
    const verdict = assessCoverage(
      {
        limit: 1,
        statuses: ['Merged'],
        cells: [cell({ status: 'Merged', titleRegex: 'a%' }, 1)],
      },
      issues('POPS-1')
    );
    expect(verdict.complete).toBe(false);
    expect(verdict.problems.join('\n')).toContain('truncated');
  });

  it('still surfaces the assumption on an otherwise failing export', () => {
    const verdict = assessCoverage(
      coverageOf([cell({ status: 'Merged', titleRegex: 'a%' }, 9)], ['Merged']),
      issues('POPS-1')
    );
    expect(verdict.complete).toBe(false);
    expect(formatCoverage(verdict).join('\n')).toContain('ASSUMED, not verified');
  });

  it('tells two patterns on the same branch apart from one on a different branch', () => {
    const verdict = assessCoverage(
      coverageOf(
        [
          cell({ status: 'Merged', hasComponent: true, titleRegex: 'a%' }, 1),
          cell({ status: 'Merged', hasComponent: false, titleRegex: 'a%' }, 1),
        ],
        ['Merged']
      ),
      issues('POPS-1', 'POPS-2')
    );
    expect(verdict.assumptions).toHaveLength(2);
  });
});

describe('assessCoverage — the narrowing cross-check', () => {
  // The ticket's own worked example: `c[^h]%` and `ch%` together miss the
  // title that is exactly "c". A `titleSearch: 'c'` cross-check is a
  // different read path over the same branch — it would return that title
  // even though neither pattern above matches it.
  const gapCoverage = (identifiersFound: string[]): Coverage => ({
    ...coverageOf(
      [
        cell({ status: 'Merged', titleRegex: 'c[^h]%' }, 1),
        cell({ status: 'Merged', titleRegex: 'ch%' }, 1),
      ],
      ['Merged']
    ),
    titleNarrowing: [
      { query: { status: 'Merged', titleSearch: 'c' }, identifiers: identifiersFound },
    ],
  });

  it('reports a missed identifier as a proven problem, not another assumption', () => {
    const verdict = assessCoverage(gapCoverage(['POPS-1', 'POPS-3']), issues('POPS-1', 'POPS-2'));
    expect(verdict.complete).toBe(false);
    expect(verdict.problems.join('\n')).toContain('POPS-3');
    expect(verdict.problems.join('\n')).toContain('titleSearch="c"');
  });

  it('the assumption line points at the problem rather than repeating it blindly', () => {
    const verdict = assessCoverage(gapCoverage(['POPS-1', 'POPS-3']), issues('POPS-1', 'POPS-2'));
    expect(verdict.assumptions[0]).toContain('found a gap');
  });

  it('marks the branch narrowed, never verified, when the cross-check finds nothing missed', () => {
    const verdict = assessCoverage(gapCoverage(['POPS-1']), issues('POPS-1', 'POPS-2'));
    expect(verdict.complete).toBe(true);
    expect(verdict.assumptions[0]).toContain('narrowed');
    expect(verdict.assumptions[0]).not.toContain('verified');
  });

  it('says a branch was not cross-checked at all when no titleNarrowing was declared', () => {
    const verdict = assessCoverage(
      coverageOf(
        [
          cell({ status: 'Merged', titleRegex: 'c[^h]%' }, 1),
          cell({ status: 'Merged', titleRegex: 'ch%' }, 1),
        ],
        ['Merged']
      ),
      issues('POPS-1', 'POPS-2')
    );
    expect(verdict.complete).toBe(true);
    expect(verdict.assumptions[0]).toContain('not cross-checked');
  });

  it('never lets a narrowed branch upgrade the headline to fully verified', () => {
    const text = formatCoverage(
      assessCoverage(gapCoverage(['POPS-1']), issues('POPS-1', 'POPS-2'))
    ).join('\n');
    expect(text).toContain('complete on every axis it can verify');
    expect(text).not.toContain('COVERAGE: complete —');
  });

  it('matches a cross-check to its branch through the non-title filters, not just status', () => {
    const verdict = assessCoverage(
      {
        ...coverageOf(
          [
            cell({ status: 'Merged', hasComponent: false, titleRegex: 'c[^h]%' }, 1),
            cell({ status: 'Merged', hasComponent: false, titleRegex: 'ch%' }, 1),
            cell({ status: 'Merged', hasComponent: true }, 1),
          ],
          ['Merged']
        ),
        titleNarrowing: [
          {
            query: { status: 'Merged', hasComponent: false, titleSearch: 'c' },
            identifiers: ['POPS-1', 'POPS-3'],
          },
        ],
      },
      issues('POPS-1', 'POPS-2', 'POPS-4')
    );
    expect(verdict.problems.join('\n')).toContain('POPS-3');
  });

  it('treats an identifier the cross-check finds as fine when it was harvested by a sibling branch', () => {
    // Branches never overlap on their own filters, so an identifier belonging
    // to THIS branch can only ever have been harvested by one of THIS
    // branch's own leaves — checking against the whole export is exactly as
    // strong as checking against the branch alone, and needs no per-cell
    // identifier bookkeeping in the export format.
    const verdict = assessCoverage(gapCoverage(['POPS-2']), issues('POPS-1', 'POPS-2'));
    expect(verdict.complete).toBe(true);
  });
});

describe('assessCoverage — every way it must refuse', () => {
  it('refuses a cell that reached the cap, and names it', () => {
    const verdict = assessCoverage(
      { limit: 2, statuses: ['Backlog'], cells: [cell({ status: 'Backlog' }, 2)] },
      issues('POPS-1', 'POPS-2')
    );
    expect(verdict.complete).toBe(false);
    expect(verdict.truncated).toHaveLength(1);
    expect(verdict.problems.join('\n')).toContain('truncated');
  });

  it('refuses a status no query covers', () => {
    const verdict = assessCoverage(
      coverageOf([cell({ status: 'Backlog' }, 1)], ['Backlog', 'Merged']),
      issues('POPS-1')
    );
    expect(verdict.complete).toBe(false);
    expect(verdict.uncovered.map(describeCell)).toEqual(['status=Merged']);
  });

  it('refuses a half-split status', () => {
    const verdict = assessCoverage(
      coverageOf([cell({ status: 'Backlog', hasComponent: true }, 1)], ['Backlog']),
      issues('POPS-1')
    );
    expect(verdict.uncovered.map(describeCell)).toEqual(['status=Backlog hasComponent=false']);
  });

  // Two identical cells are one query counted twice. Left unflagged, the totals
  // reconcile against a row count that is short by exactly the overlap.
  it('refuses a cell declared twice', () => {
    const verdict = assessCoverage(
      coverageOf([cell({ status: 'Backlog' }, 1), cell({ status: 'Backlog' }, 1)], ['Backlog']),
      issues('POPS-1')
    );
    expect(verdict.complete).toBe(false);
    expect(verdict.duplicateCells).toEqual(['status=Backlog']);
  });

  it('refuses an export whose rows do not add up to what its queries claim', () => {
    const verdict = assessCoverage(
      coverageOf([cell({ status: 'Backlog' }, 5)], ['Backlog']),
      issues('POPS-1')
    );
    expect(verdict.complete).toBe(false);
    expect(verdict.problems.join('\n')).toContain('claim 5 rows but the export holds 1');
  });

  // Overlapping filters would inflate the row count past the cells' total and
  // hide a genuinely missing branch behind an apparently healthy sum.
  it('refuses an export that lists the same issue twice', () => {
    const verdict = assessCoverage(
      coverageOf([cell({ status: 'Backlog' }, 2)], ['Backlog']),
      issues('POPS-1', 'POPS-1')
    );
    expect(verdict.complete).toBe(false);
    expect(verdict.duplicateIdentifiers).toEqual(['POPS-1']);
  });

  // "Every declared status is covered" over an empty status list is true and
  // means nothing. Vacuous truth is the most convincing kind of false negative.
  it('refuses coverage that declares no statuses at all', () => {
    const verdict = assessCoverage({ limit: 200, statuses: [], cells: [] }, []);
    expect(verdict.complete).toBe(false);
    expect(verdict.problems.join('\n')).toContain('claim about nothing');
  });

  it('refuses coverage with no cells', () => {
    const verdict = assessCoverage(coverageOf([], ['Backlog']), []);
    expect(verdict.complete).toBe(false);
    expect(verdict.uncovered.map(describeCell)).toEqual(['status=Backlog']);
  });

  it('reports each reason separately rather than collapsing to one failure', () => {
    const verdict = assessCoverage(
      { limit: 2, statuses: ['Backlog', 'Done'], cells: [cell({ status: 'Backlog' }, 2)] },
      issues('POPS-1', 'POPS-1')
    );
    expect(verdict.problems.length).toBeGreaterThanOrEqual(3);
  });
});

describe('assessCoverage — an export that claims nothing', () => {
  it('is unknown, not complete', () => {
    const verdict = assessCoverage(undefined, issues('POPS-1'));
    expect(verdict.declared).toBe(false);
    expect(verdict.complete).toBe(false);
    expect(formatCoverage(verdict)[0]).toContain('COVERAGE: UNKNOWN');
  });

  it('is unknown even when empty — zero issues proves nothing about the backlog', () => {
    expect(assessCoverage(undefined, []).complete).toBe(false);
  });

  // A row count sitting exactly on the cap is what a single unpartitioned call
  // looks like from the outside, and is worth saying out loud.
  it('points out a row count sitting exactly on the API cap', () => {
    const capped = assessCoverage(
      undefined,
      issues(...Array.from({ length: DEFAULT_LIMIT }, (_, index) => `POPS-${index + 1}`))
    );
    expect(capped.problems.join('\n')).toContain('what one truncated call looks like');
  });

  it('does not cry cap for an ordinary short export', () => {
    expect(assessCoverage(undefined, issues('POPS-1')).problems).toHaveLength(1);
  });
});

describe('readCoverage', () => {
  it('reads a well-formed block', () => {
    const parsed = {
      coverage: {
        limit: 200,
        statuses: ['Backlog'],
        cells: [{ filter: { status: 'Backlog' }, count: 4 }],
      },
      result: [],
    };
    expect(readCoverage(parsed)?.cells).toEqual([{ filter: { status: 'Backlog' }, count: 4 }]);
  });

  it('reads an absent block as undeclared', () => {
    expect(readCoverage({ result: [] })).toBeUndefined();
    expect(readCoverage([])).toBeUndefined();
    expect(readCoverage('nope')).toBeUndefined();
  });

  // Every other field is trimmed on the way in. A title pattern is not: its
  // leading and trailing whitespace is part of what it matches, so trimming it
  // would silently change which rows the cell claims to have covered.
  it('leaves a title pattern exactly as written, whitespace and all', () => {
    const coverage = readCoverage({
      coverage: { cells: [{ filter: { titleRegex: ' a% ' }, count: 1 }] },
    });
    expect(coverage?.cells?.[0]?.filter.titleRegex).toBe(' a% ');
  });

  it('trims the strings it reads, so a padded status still matches its cell', () => {
    const verdict = assessCoverage(
      readCoverage({
        coverage: {
          statuses: [' Backlog '],
          cells: [{ filter: { status: 'Backlog ' }, count: 1 }],
        },
      }),
      issues('POPS-1')
    );
    expect(verdict.complete).toBe(true);
  });

  // A malformed block is a broken proof, not a missing one. Falling back to
  // "undeclared" would quietly downgrade the first into the second.
  it.each([
    ['a non-object block', { coverage: [] }, /"coverage" must be an object/u],
    // A block naming no queries is a proof of nothing. Reading it as an empty
    // cell list would let `coverage: {}` pass for provenance.
    ['a block with no cells at all', { coverage: {} }, /cells must be an array/u],
    ['cells that are not an array', { coverage: { cells: {} } }, /cells must be an array/u],
    ['a non-object cell', { coverage: { cells: [1] } }, /cells\[0\] is not an object/u],
    [
      'a cell with no count',
      { coverage: { cells: [{ filter: {} }] } },
      /cells\[0\]\.count must be a non-negative integer/u,
    ],
    [
      'a fractional count',
      { coverage: { cells: [{ filter: {}, count: 1.5 }] } },
      /non-negative integer/u,
    ],
    [
      'a negative count',
      { coverage: { cells: [{ filter: {}, count: -1 }] } },
      /non-negative integer/u,
    ],
    [
      'a cell with no filter',
      { coverage: { cells: [{ count: 1 }] } },
      /cells\[0\]\.filter must be an object/u,
    ],
    [
      'a non-boolean boolean filter',
      { coverage: { cells: [{ filter: { hasComponent: 'true' }, count: 1 }] } },
      /hasComponent must be a boolean/u,
    ],
    [
      'a non-string status filter',
      { coverage: { cells: [{ filter: { status: 7 }, count: 1 }] } },
      /status must be a string/u,
    ],
    // Trimmed to nothing, this would be a filter matching no root, and the
    // branch it was meant to cover would read as uncovered — the export
    // condemned for the wrong reason instead of the row being named.
    [
      'a whitespace-only status filter',
      { coverage: { cells: [{ filter: { status: '   ' }, count: 1 }] } },
      /status is empty/u,
    ],
    [
      'an empty component filter',
      { coverage: { cells: [{ filter: { component: '' }, count: 1 }] } },
      /component is empty/u,
    ],
    [
      'a non-string title pattern',
      { coverage: { cells: [{ filter: { titleRegex: /a/u.source.length }, count: 1 }] } },
      /titleRegex must be a string/u,
    ],
    // The API itself refuses both at once, so a filter naming both can never
    // be the query that actually ran — accepting it would let an impossible
    // cell stand in as part of a coverage proof.
    [
      'a filter that sets both titleRegex and titleSearch',
      { coverage: { cells: [{ filter: { titleRegex: 'a%', titleSearch: 'a' }, count: 1 }] } },
      /sets both titleRegex and titleSearch/u,
    ],
    ['a zero limit', { coverage: { limit: 0, cells: [] } }, /limit must be a positive integer/u],
    [
      'statuses that are not strings',
      { coverage: { statuses: [7], cells: [] } },
      /statuses must be an array of strings/u,
    ],
    [
      'a whitespace-only status in the list',
      { coverage: { statuses: ['Backlog', '  '], cells: [] } },
      /statuses\[1\] is empty/u,
    ],
    [
      'an empty component in the list',
      { coverage: { components: [''], cells: [] } },
      /components\[0\] is empty/u,
    ],
    [
      'titleNarrowing that is not an array',
      { coverage: { cells: [], titleNarrowing: {} } },
      /titleNarrowing must be an array/u,
    ],
    [
      'a non-object titleNarrowing entry',
      { coverage: { cells: [], titleNarrowing: [1] } },
      /titleNarrowing\[0\] is not an object/u,
    ],
    [
      'a titleNarrowing entry with no query',
      { coverage: { cells: [], titleNarrowing: [{ identifiers: [] }] } },
      /titleNarrowing\[0\]\.query must be an object/u,
    ],
    // Not merely a query with no title field at all: `titleSearch` is the one
    // thing that makes a query a cross-check rather than just another cell.
    [
      'a titleNarrowing query with no titleSearch',
      { coverage: { cells: [], titleNarrowing: [{ query: { status: 'M' }, identifiers: [] }] } },
      /titleNarrowing\[0\]\.query\.titleSearch is required/u,
    ],
    [
      'a titleNarrowing entry with no identifiers',
      { coverage: { cells: [], titleNarrowing: [{ query: { titleSearch: 'c' } }] } },
      /titleNarrowing\[0\]\.identifiers must be an array of strings/u,
    ],
    [
      'a titleNarrowing identifiers entry that is not a string',
      {
        coverage: {
          cells: [],
          titleNarrowing: [{ query: { titleSearch: 'c' }, identifiers: [7] }],
        },
      },
      /titleNarrowing\[0\]\.identifiers must be an array of strings/u,
    ],
    [
      'a titleNarrowing query that sets both titleRegex and titleSearch',
      {
        coverage: {
          cells: [],
          titleNarrowing: [{ query: { titleRegex: 'a%', titleSearch: 'a' }, identifiers: [] }],
        },
      },
      /sets both titleRegex and titleSearch/u,
    ],
  ])('throws on %s rather than reading it as undeclared', (_name, parsed, message) => {
    expect(() => readCoverage(parsed)).toThrow(message);
  });

  it('reads a well-formed titleNarrowing block', () => {
    const coverage = readCoverage({
      coverage: {
        cells: [],
        titleNarrowing: [
          { query: { status: 'Merged', titleSearch: 'c' }, identifiers: ['POPS-1'] },
        ],
      },
    });
    expect(coverage?.titleNarrowing).toEqual([
      { query: { status: 'Merged', titleSearch: 'c' }, identifiers: ['POPS-1'] },
    ]);
  });

  it('reads an absent titleNarrowing as empty rather than as an error', () => {
    expect(readCoverage({ coverage: { cells: [] } })?.titleNarrowing).toEqual([]);
  });

  // Not trimmed, unlike `status`/`component`: a search term's edge whitespace
  // is part of what it matches.
  it('leaves a titleSearch term exactly as written, whitespace and all', () => {
    const coverage = readCoverage({
      coverage: { cells: [], titleNarrowing: [{ query: { titleSearch: ' c ' }, identifiers: [] }] },
    });
    expect(coverage?.titleNarrowing?.[0]?.query.titleSearch).toBe(' c ');
  });
});

describe('readRows', () => {
  it('reads a bare array and the result envelope alike', () => {
    expect(readRows([{ identifier: 'POPS-1' }])).toEqual([{ identifier: 'POPS-1' }]);
    expect(readRows({ result: [{ identifier: 'POPS-1' }] })).toEqual([{ identifier: 'POPS-1' }]);
  });

  it('reads an empty export as empty, not as an error', () => {
    expect(readRows({ result: [] })).toEqual([]);
  });

  // Coercing any of these to `[]` produces an export of zero issues, which
  // assesses as a tiny clean backlog — the most convincing wrong answer
  // available. Each has to be a refusal instead.
  it.each([
    ['a missing result', { coverage: {} }],
    ['a null result', { result: null }],
    ['an object result', { result: { a: 1 } }],
    ['a string result', { result: 'POPS-1' }],
  ])('refuses %s rather than reading it as no issues', (_name, parsed) => {
    expect(() => readRows(parsed)).toThrow(/"result" must be an array/u);
  });

  it('refuses a scalar export outright', () => {
    expect(() => readRows('nope')).toThrow(/expected a JSON array/u);
    expect(() => readRows(null)).toThrow(/expected a JSON array/u);
  });

  // These would otherwise blow up inside `duplicateIdentifiers`, which runs
  // outside the CLI's read guard — losing both the message naming the row and
  // the exit code that means "your file is malformed".
  it.each([
    ['a null row', { result: [null] }, /index 0 is not an object/u],
    ['a number row', { result: [1] }, /index 0 is not an object/u],
    ['an array row', { result: [[]] }, /index 0 is not an object/u],
  ])('refuses %s with its index', (_name, parsed, message) => {
    expect(() => readRows(parsed)).toThrow(message);
  });

  it.each([
    ['no identifier', { title: 't' }],
    ['a non-string identifier', { identifier: 7 }],
    ['a blank identifier', { identifier: '   ' }],
  ])('refuses a row with %s', (_name, row) => {
    expect(() => readRows({ result: [{ identifier: 'POPS-1' }, row] })).toThrow(
      /index 1 has no string "identifier"/u
    );
  });

  it('trims the identifier it reads', () => {
    expect(readRows([{ identifier: ' POPS-1 ' }])).toEqual([{ identifier: 'POPS-1' }]);
  });
});
