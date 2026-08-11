import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LIMIT,
  describeCell,
  findUncovered,
  isTruncated,
  narrowingQueries,
  partitionRoots,
  refineCell,
  titleBase,
  titlePartitions,
  titleSearchPrefix,
} from '../huly-partition.mjs';

type Cell = Parameters<typeof describeCell>[0];
type CoverageCell = Parameters<typeof titlePartitions>[0][number];

const cell = (filter: Cell, count: number): CoverageCell => ({ filter, count });
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

  it('renders titleSearch the same way, after titleRegex', () => {
    expect(describeCell({ status: 'M', titleSearch: 'ch' })).toBe('status=M titleSearch=ch');
  });
});

describe('titleBase', () => {
  it('strips a title pattern, leaving the branch it divides', () => {
    expect(titleBase({ status: 'M', hasComponent: false, titleRegex: 'a%' })).toEqual({
      status: 'M',
      component: undefined,
      hasComponent: false,
      hasAssignee: undefined,
      hasDueDate: undefined,
    });
  });

  it('strips a titleSearch the same way, so a narrowing query maps back to its branch', () => {
    const query: Cell = { status: 'M', titleSearch: 'c' };
    expect(describeCell(titleBase(query))).toBe(describeCell({ status: 'M' }));
  });
});

describe('titleSearchPrefix', () => {
  it.each([
    ['d%', 'd'],
    ['f[^e]%', 'f'],
    // The ticket's own worked example: two patterns that diverge before
    // either special character, so they yield different, non-empty prefixes.
    ['c[^h]%', 'c'],
    ['ch%', 'ch'],
    ['feat\\([a-e]%', 'feat('],
    ['[a-m]%', ''],
    ['%', ''],
  ])('reads the leading literal substring of %s as %s', (pattern, expected) => {
    expect(titleSearchPrefix(pattern)).toBe(expected);
  });

  it('treats an escaped special character as literal', () => {
    expect(titleSearchPrefix('a\\%b%')).toBe('a%b');
  });

  it('reads a pattern with no special character as its own whole prefix', () => {
    expect(titleSearchPrefix('exact')).toBe('exact');
  });
});

describe('narrowingQueries', () => {
  it("builds one titleSearch cross-check per pattern in the ticket's own example", () => {
    const queries = narrowingQueries({ status: 'Merged' }, ['c[^h]%', 'ch%']);
    expect(queries.map((query) => query.titleSearch)).toEqual(['c', 'ch']);
  });

  it('carries the rest of the branch filters into each cross-check', () => {
    const branch: Cell = { status: 'Merged', hasComponent: false, hasAssignee: true };
    const [query] = narrowingQueries(branch, ['d%']);
    expect(query?.status).toBe('Merged');
    expect(query?.hasComponent).toBe(false);
    expect(query?.hasAssignee).toBe(true);
    expect(query?.titleRegex).toBeUndefined();
  });

  it('dedupes two patterns that share the same literal prefix', () => {
    const queries = narrowingQueries({ status: 'X' }, ['c[^h]%', 'c[jk]%']);
    expect(queries).toHaveLength(1);
    expect(queries[0]?.titleSearch).toBe('c');
  });

  it('drops a pattern whose special character comes first — nothing narrower than the branch itself', () => {
    expect(narrowingQueries({ status: 'X' }, ['[a-m]%'])).toEqual([]);
  });

  it('returns nothing for an empty pattern list', () => {
    expect(narrowingQueries({ status: 'X' }, [])).toEqual([]);
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

  // Fanning this out would hand back children covering every label in place of
  // the one the cell names — a child set wider than its parent, which makes a
  // covered branch read as uncovered depending only on what labels were passed.
  it('does not fan out a cell that names a component and also says hasComponent', () => {
    expect(
      refineCell(
        {
          status: 'X',
          component: 'ios',
          hasComponent: true,
          hasAssignee: true,
          hasDueDate: true,
        },
        ['ios', 'bfm']
      )
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
