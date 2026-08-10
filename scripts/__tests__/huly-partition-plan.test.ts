import { describe, expect, it } from 'vitest';

import {
  assessCoverage,
  DEFAULT_LIMIT,
  describeCell,
  findUncovered,
  formatCoverage,
  isTruncated,
  partitionRoots,
  readCoverage,
  readFlag,
  readRows,
  refineCell,
  titlePartitions,
} from '../huly-partition-plan.mjs';

type Cell = Parameters<typeof describeCell>[0];
type Coverage = NonNullable<Parameters<typeof assessCoverage>[0]>;
type CoverageCell = NonNullable<Coverage['cells']>[number];

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

const present = (...cells: Cell[]): Set<string> => new Set(cells.map(describeCell));

describe('isTruncated', () => {
  // The whole failure this module exists to prevent: a caller asking for 200,
  // getting 200, and reading it as the answer.
  it('calls a result that fills the page truncated', () => {
    expect(isTruncated(200, 200)).toBe(true);
    expect(isTruncated(DEFAULT_LIMIT)).toBe(true);
  });

  it('calls an over-full result truncated rather than trusting it', () => {
    expect(isTruncated(201, 200)).toBe(true);
  });

  it('calls a short result complete', () => {
    expect(isTruncated(199, 200)).toBe(false);
    expect(isTruncated(0, 200)).toBe(false);
  });

  it('defaults to the API cap when no limit is given', () => {
    expect(isTruncated(DEFAULT_LIMIT - 1)).toBe(false);
  });
});

describe('describeCell', () => {
  it('renders keys in a fixed order, so it doubles as an identity key', () => {
    expect(describeCell({ hasDueDate: false, status: 'Backlog', hasAssignee: true })).toBe(
      'status=Backlog hasAssignee=true hasDueDate=false'
    );
  });

  it('distinguishes the two halves of a boolean split', () => {
    expect(describeCell({ status: 'X', hasComponent: true })).not.toBe(
      describeCell({ status: 'X', hasComponent: false })
    );
  });

  it('names the empty filter rather than rendering nothing', () => {
    expect(describeCell({})).toBe('(unfiltered)');
  });

  it('renders the title pattern last, so a branch and its title splits sort together', () => {
    expect(describeCell({ titleRegex: 'a%', status: 'M', hasComponent: false })).toBe(
      'status=M hasComponent=false titleRegex=a%'
    );
  });
});

describe('partitionRoots / refineCell', () => {
  it('starts from one cell per workflow status', () => {
    expect(partitionRoots(['Backlog', 'Done'])).toEqual([
      { status: 'Backlog' },
      { status: 'Done' },
    ]);
  });

  it('spends the boolean filters in a fixed order', () => {
    const first = refineCell({ status: 'X' });
    expect(first?.map(describeCell)).toEqual([
      'status=X hasComponent=true',
      'status=X hasComponent=false',
    ]);

    const second = refineCell({ status: 'X', hasComponent: true });
    expect(second?.every((child) => child.hasAssignee !== undefined)).toBe(true);

    const third = refineCell({ status: 'X', hasComponent: true, hasAssignee: false });
    expect(third?.every((child) => child.hasDueDate !== undefined)).toBe(true);
  });

  it('splits each boolean both ways, so the children complement', () => {
    for (const parent of [{ status: 'X' }, { status: 'X', hasComponent: true }] satisfies Cell[]) {
      const children = refineCell(parent);
      expect(children).toHaveLength(2);
      expect(new Set(children?.map(describeCell)).size).toBe(2);
    }
  });

  it('fans a spent hasComponent:true cell out over the component labels', () => {
    const children = refineCell(
      { status: 'X', hasComponent: true, hasAssignee: true, hasDueDate: true },
      ['ios', 'bfm']
    );
    expect(children?.map((child) => child.component)).toEqual(['ios', 'bfm']);
    // The label replaces hasComponent rather than joining it: a cell carrying
    // both would be refined a second time and fan out over the labels again.
    expect(children?.every((child) => child.hasComponent === undefined)).toBe(true);
  });

  it('admits it cannot divide a spent hasComponent:false cell', () => {
    expect(
      refineCell({ status: 'X', hasComponent: false, hasAssignee: false, hasDueDate: false }, [
        'ios',
      ])
    ).toBeUndefined();
  });

  it('admits it cannot divide a hasComponent:true cell with no labels to divide by', () => {
    expect(
      refineCell({ status: 'X', hasComponent: true, hasAssignee: true, hasDueDate: true }, [])
    ).toBeUndefined();
  });

  it('treats a component cell as a leaf rather than fanning out again', () => {
    expect(
      refineCell({ status: 'X', component: 'ios', hasAssignee: true, hasDueDate: true }, ['ios'])
    ).toBeUndefined();
  });
});

describe('findUncovered', () => {
  it('reports nothing when the cell itself was queried', () => {
    expect(findUncovered({ status: 'X' }, present({ status: 'X' }), [])).toEqual({
      uncovered: [],
      assumed: [],
    });
  });

  it('accepts a refinement in place of the parent', () => {
    const cells = present(
      { status: 'X', hasComponent: true },
      { status: 'X', hasComponent: false }
    );
    expect(findUncovered({ status: 'X' }, cells, []).uncovered).toEqual([]);
  });

  it('accepts a lopsided refinement, refined only where it had to be', () => {
    const cells = present(
      { status: 'X', hasComponent: false },
      { status: 'X', hasComponent: true, hasAssignee: true },
      { status: 'X', hasComponent: true, hasAssignee: false }
    );
    expect(findUncovered({ status: 'X' }, cells, []).uncovered).toEqual([]);
  });

  it('names the one missing half of a split', () => {
    const cells = present({ status: 'X', hasComponent: true });
    expect(findUncovered({ status: 'X' }, cells, []).uncovered.map(describeCell)).toEqual([
      'status=X hasComponent=false',
    ]);
  });

  // A status nobody queried is one missing status, not eighty-four missing
  // filter combinations. A report that explodes is a report nobody reads.
  it('reports an entirely untouched branch at its own level', () => {
    expect(
      findUncovered({ status: 'X' }, present({ status: 'Y' }), ['ios', 'bfm']).uncovered
    ).toEqual([{ status: 'X' }]);
  });

  it('names an uncoverable leaf rather than passing over it', () => {
    const target: Cell = { status: 'X', hasComponent: false, hasAssignee: true, hasDueDate: true };
    expect(findUncovered(target, present({ status: 'Y' }), []).uncovered).toEqual([target]);
  });

  // The title axis is the only one left once the enumerable filters are spent,
  // and it is the one nothing can vouch for. "Neither covered nor missing" is
  // the honest third answer, and it has to survive as far as the report.
  it('records a title-partitioned branch as an assumption, not as coverage', () => {
    const titles = new Map([['status=X', ['[a-m]%', '[^a-m]%']]]);
    const gaps = findUncovered({ status: 'X' }, new Set<string>(), [], titles);
    expect(gaps.uncovered).toEqual([]);
    expect(gaps.assumed).toEqual([{ branch: { status: 'X' }, patterns: ['[a-m]%', '[^a-m]%'] }]);
  });

  it('finds a title partition sitting deep in a refinement, not only at the root', () => {
    const branch: Cell = {
      status: 'X',
      hasComponent: false,
      hasAssignee: false,
      hasDueDate: false,
    };
    const gaps = findUncovered(
      { status: 'X' },
      present(
        { status: 'X', hasComponent: true },
        { status: 'X', hasComponent: false, hasAssignee: true },
        { status: 'X', hasComponent: false, hasAssignee: false, hasDueDate: true }
      ),
      [],
      new Map([[describeCell(branch), ['d%']]])
    );
    expect(gaps.uncovered).toEqual([]);
    expect(gaps.assumed.map((entry) => describeCell(entry.branch))).toEqual([describeCell(branch)]);
  });

  it('does not treat an empty pattern list as coverage', () => {
    const gaps = findUncovered({ status: 'X' }, new Set<string>(), [], new Map([['status=X', []]]));
    expect(gaps.assumed).toEqual([]);
    expect(gaps.uncovered).toEqual([{ status: 'X' }]);
  });
});

describe('titlePartitions', () => {
  it('indexes patterns by the branch they divide, ignoring the pattern itself', () => {
    const indexed = titlePartitions([
      cell({ status: 'M', hasComponent: false, titleRegex: 'a%' }, 1),
      cell({ status: 'M', hasComponent: false, titleRegex: 'b%' }, 1),
      cell({ status: 'M', hasComponent: true }, 1),
    ]);
    expect([...indexed.entries()]).toEqual([['status=M hasComponent=false', ['a%', 'b%']]]);
  });

  it('reads nothing from cells that carry no title pattern', () => {
    expect(titlePartitions([cell({ status: 'M' }, 1)]).size).toBe(0);
  });
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
    ['a zero limit', { coverage: { limit: 0, cells: [] } }, /limit must be a positive integer/u],
    [
      'statuses that are not strings',
      { coverage: { statuses: [7], cells: [] } },
      /statuses must be an array of strings/u,
    ],
  ])('throws on %s rather than reading it as undeclared', (_name, parsed, message) => {
    expect(() => readCoverage(parsed)).toThrow(message);
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
});

describe('readFlag', () => {
  it('reads the value after the flag', () => {
    expect(readFlag(['--assess', 'a.json'], '--assess')).toBe('a.json');
  });

  it('does not swallow the next flag as a value', () => {
    expect(readFlag(['--assess', '--json'], '--assess')).toBeUndefined();
    expect(readFlag(['--assess'], '--assess')).toBeUndefined();
    expect(readFlag([], '--assess')).toBeUndefined();
  });
});
