import { describe, expect, it } from 'vitest';

import {
  bodyAuthorshipRefs,
  classifyIssue,
  extractIdentifiers,
  findMirrors,
  formatReport,
  isRevertSubject,
  normaliseSubject,
  parseGitLog,
  partialWorkMarker,
  peelTrailingGroups,
  readIssues,
  readRefGroup,
  reconcile,
  relateCommit,
  subjectAuthorshipRefs,
} from '../huly-backlog-reconcile.mjs';

type Commit = Parameters<typeof relateCommit>[0];
type Issue = Parameters<typeof classifyIssue>[0];

const PREFIX = 'POPS';

const commit = (sha: string, subject: string, body = ''): Commit => ({ sha, subject, body });
const backlog = (identifier: string, title = identifier): Issue => ({
  identifier,
  title,
  status: 'Backlog',
});

/**
 * The commit that fixed POPS-1452. Its ticket is named ONLY by a bare trailing
 * line in the body — the subject carries the squash-merge PR number and
 * nothing else. Any classifier that reads subjects alone misses it.
 */
const FIXES_VIA_BODY_TRAILER = commit(
  'e0b471ae1c0000000000000000000000000000000',
  'fix(bfm,food,cerebrum): drop redundant 503 check in isUnavailableError copies (#3919)',
  [
    'food and cerebrum tested err.status === 503 separately from err.status >= 500.',
    '',
    'Both files now use the same two-clause form as the other six copies.',
    '',
    'POPS-1452',
    '',
  ].join('\n')
);

/**
 * The trap. This commit fixes POPS-1382 and names four OTHER tickets in its
 * body as follow-ups it filed. All four are genuinely open; a grep for the
 * identifier would have closed every one of them.
 */
const MENTIONS_FOUR_OPEN_FOLLOW_UPS = commit(
  '048d736820000000000000000000000000000000',
  'feat(ios): authenticating middleware with single-flight refresh (POPS-1382)',
  [
    'Every authenticated request now goes through AuthenticatingMiddleware.',
    '',
    'The seam is a ClientMiddleware rather than the ClientTransport the ticket',
    'named. That predates POPS-1380, which made the transport initialiser internal.',
    '',
    'Also closes a credential leak that would have arrived with this change.',
    '',
    'Follow-ups filed: POPS-1647, POPS-1648, POPS-1653, POPS-1654.',
    '',
  ].join('\n')
);

const FOLLOW_UPS = ['POPS-1647', 'POPS-1648', 'POPS-1653', 'POPS-1654'];

describe('extractIdentifiers', () => {
  it('never matches a shorter identifier inside a longer one', () => {
    expect(extractIdentifiers('POPS-1452', PREFIX)).toEqual(['POPS-1452']);
    expect(extractIdentifiers('POPS-1452', PREFIX)).not.toContain('POPS-145');
  });

  it('de-duplicates repeats and finds identifiers mid-sentence', () => {
    expect(extractIdentifiers('see POPS-1, and POPS-1 again, plus POPS-22.', PREFIX)).toEqual([
      'POPS-1',
      'POPS-22',
    ]);
  });

  it('ignores a different tracker prefix', () => {
    expect(extractIdentifiers('OTHER-9 and POPS-9', PREFIX)).toEqual(['POPS-9']);
  });
});

describe('peelTrailingGroups', () => {
  it('peels each trailing group right to left', () => {
    expect(peelTrailingGroups('feat(x): thing (POPS-1) (#3945)')).toEqual(['#3945', 'POPS-1']);
  });

  it('stops at the first non-trailing text', () => {
    expect(peelTrailingGroups('fix(x): not 2 (POPS-1)')).toEqual(['POPS-1']);
  });

  it('handles a nested group without unbalancing', () => {
    expect(peelTrailingGroups('feat(x): thing (a (b) c)')).toEqual(['a (b) c']);
  });

  it('returns nothing for a subject that does not end in a group', () => {
    expect(peelTrailingGroups('fix(bfm,food,cerebrum): drop the check')).toEqual([]);
  });
});

describe('readRefGroup', () => {
  it('accepts a group of nothing but identifiers', () => {
    expect(readRefGroup('POPS-1599, POPS-1592', PREFIX)).toEqual(['POPS-1599', 'POPS-1592']);
  });

  it('rejects a group carrying any non-identifier token', () => {
    expect(readRefGroup('POPS-237 slice 1', PREFIX)).toBeUndefined();
    expect(readRefGroup('POPS-239 prerequisite', PREFIX)).toBeUndefined();
    expect(readRefGroup('finally', PREFIX)).toBeUndefined();
  });

  it('rejects an empty group', () => {
    expect(readRefGroup('   ', PREFIX)).toBeUndefined();
  });
});

describe('subjectAuthorshipRefs', () => {
  it.each([
    ['fix(x): thing (POPS-1)', ['POPS-1']],
    ['fix(ci): drift-gate all 11 clients, not 2 (POPS-1465) (#3933)', ['POPS-1465']],
    [
      'feat(shell): type-check e2e/ and scripts/ (POPS-1599, POPS-1592) (#3941)',
      ['POPS-1599', 'POPS-1592'],
    ],
    ['feat(x): thing (POPS-1) (POPS-2)', ['POPS-2', 'POPS-1']],
  ])('reads %s as authorship of %j', (subject, expected) => {
    expect(subjectAuthorshipRefs(subject, PREFIX)).toEqual(expected);
  });

  it.each([
    'feat(purchases): reconciliation solver — the pure ladder (POPS-237 slice 1) (#3824)',
    'feat(purchases): honour autoLinkPolicy (POPS-239 prerequisite) (#3829)',
    'docs: mention POPS-123 in the README',
    'Revert "fix(x): thing (POPS-1)"',
  ])('reads no authorship in %s', (subject) => {
    expect(subjectAuthorshipRefs(subject, PREFIX)).toEqual([]);
  });

  it('reads nothing from a subject whose only parens are a conventional-commit scope', () => {
    expect(
      subjectAuthorshipRefs('fix(bfm,food,cerebrum): drop the redundant check (#3919)', PREFIX)
    ).toEqual([]);
  });
});

describe('bodyAuthorshipRefs', () => {
  it('reads a bare trailing identifier line as the commit ticket', () => {
    expect(bodyAuthorshipRefs(FIXES_VIA_BODY_TRAILER.body, PREFIX)).toEqual(['POPS-1452']);
  });

  it('reads a bare trailing list of identifiers', () => {
    expect(bodyAuthorshipRefs('did a thing\n\nPOPS-1, POPS-2\n', PREFIX)).toEqual([
      'POPS-1',
      'POPS-2',
    ]);
  });

  it('reads an explicit Closes trailer anywhere in the body', () => {
    expect(bodyAuthorshipRefs('Closes: POPS-7\n\nsome closing prose.\n', PREFIX)).toEqual([
      'POPS-7',
    ]);
  });

  it('does NOT read a follow-ups prose line, even as the last line', () => {
    expect(bodyAuthorshipRefs(MENTIONS_FOUR_OPEN_FOLLOW_UPS.body, PREFIX)).toEqual([]);
  });

  it('does NOT read a bare list that shares its block with prose', () => {
    expect(
      bodyAuthorshipRefs('did a thing\n\nFollow-ups filed:\nPOPS-2, POPS-3\n', PREFIX)
    ).toEqual([]);
  });

  it('does NOT read prose that merely opens with a trailer-ish word', () => {
    expect(bodyAuthorshipRefs('Also closes a leak reported in POPS-9.\n', PREFIX)).toEqual([]);
  });

  it('reads nothing from an empty body', () => {
    expect(bodyAuthorshipRefs('', PREFIX)).toEqual([]);
  });
});

describe('isRevertSubject / partialWorkMarker', () => {
  it.each(['revert: feat(x): thing (POPS-1)', 'Revert "feat(x): thing"', 'revert(x): thing'])(
    'sees %s as a revert',
    (subject) => {
      expect(isRevertSubject(subject)).toBe(true);
    }
  );

  it('does not see a normal subject as a revert', () => {
    expect(isRevertSubject('fix(x): reverted nothing here')).toBe(false);
  });

  it.each(['feat(x): REST migration slice 9b (POPS-1)', 'feat(x): WIP thing (POPS-1)'])(
    'flags the instalment marker in %s',
    (subject) => {
      expect(partialWorkMarker(subject)).toBeDefined();
    }
  );

  it('leaves an ordinary subject unflagged', () => {
    expect(partialWorkMarker('fix(bfm): enforce retention >= TTL at boot')).toBeUndefined();
  });
});

describe('relateCommit', () => {
  it('separates the four relations on one commit', () => {
    expect(relateCommit(MENTIONS_FOUR_OPEN_FOLLOW_UPS, 'POPS-1382', PREFIX)).toBe('fixes-subject');
    expect(relateCommit(MENTIONS_FOUR_OPEN_FOLLOW_UPS, 'POPS-1647', PREFIX)).toBe('body-mention');
    expect(relateCommit(MENTIONS_FOUR_OPEN_FOLLOW_UPS, 'POPS-9999', PREFIX)).toBe('none');
    expect(relateCommit(FIXES_VIA_BODY_TRAILER, 'POPS-1452', PREFIX)).toBe('fixes-body');
  });

  it('calls a subject mention outside the authorship position what it is', () => {
    expect(
      relateCommit(commit('a1', 'docs: mention POPS-123 in the README'), 'POPS-123', PREFIX)
    ).toBe('subject-mention');
  });
});

describe('classifyIssue', () => {
  const commits = [FIXES_VIA_BODY_TRAILER, MENTIONS_FOUR_OPEN_FOLLOW_UPS];

  it('calls the worked example an orphan, citing the body trailer', () => {
    const verdict = classifyIssue(backlog('POPS-1452'), commits, PREFIX);
    expect(verdict.verdict).toBe('orphan');
    expect(verdict.fixes).toHaveLength(1);
    expect(verdict.fixes[0]?.evidence).toBe('body-trailer');
  });

  it('calls the subject-referenced ticket an orphan', () => {
    const verdict = classifyIssue(backlog('POPS-1382'), commits, PREFIX);
    expect(verdict.verdict).toBe('orphan');
    expect(verdict.fixes[0]?.evidence).toBe('subject-ref');
  });

  it.each(FOLLOW_UPS)('leaves %s open — the same commit mentions it, and does not fix it', (id) => {
    const verdict = classifyIssue(backlog(id), commits, PREFIX);
    expect(verdict.verdict).toBe('mentioned');
    expect(verdict.fixes).toEqual([]);
  });

  it('leaves a ticket named only as prior art in a body open', () => {
    expect(classifyIssue(backlog('POPS-1380'), commits, PREFIX).verdict).toBe('mentioned');
  });

  it('reports no match for a ticket no commit names', () => {
    const verdict = classifyIssue(backlog('POPS-9999'), commits, PREFIX);
    expect(verdict.verdict).toBe('no-match');
    expect(verdict.concerns).toEqual([]);
  });

  it('demotes a revert-only authorship match to review', () => {
    const verdict = classifyIssue(
      backlog('POPS-5'),
      [commit('r1', 'revert: feat(x): the thing (POPS-5)')],
      PREFIX
    );
    expect(verdict.verdict).toBe('review');
    expect(verdict.fixes).toEqual([]);
    expect(verdict.concerns[0]?.why).toContain('revert');
  });

  it('demotes an instalment commit to review rather than closing the parent', () => {
    const verdict = classifyIssue(
      backlog('POPS-237'),
      [commit('s1', 'feat(purchases): reconciliation sweep, slice 2 (POPS-237)')],
      PREFIX
    );
    expect(verdict.verdict).toBe('review');
    expect(verdict.concerns[0]?.why).toContain('instalment');
  });

  it('demotes a ticket that has both an authorship match and a subject mention', () => {
    const verdict = classifyIssue(
      backlog('POPS-8'),
      [commit('c1', 'fix(x): done (POPS-8)'), commit('c2', 'chore: partially undo POPS-8 for now')],
      PREFIX
    );
    expect(verdict.verdict).toBe('review');
    expect(verdict.fixes).toHaveLength(1);
  });

  it('does not demote on a body mention alongside an authorship match', () => {
    const verdict = classifyIssue(
      backlog('POPS-8'),
      [commit('c1', 'fix(x): done (POPS-8)'), commit('c2', 'feat: other', 'built atop POPS-8.')],
      PREFIX
    );
    expect(verdict.verdict).toBe('orphan');
  });
});

describe('normaliseSubject / findMirrors', () => {
  it('strips only a trailing squash-merge PR number', () => {
    expect(normaliseSubject('fix(x): thing (#3919)')).toBe('fix(x): thing');
    expect(normaliseSubject('fix(x): thing (POPS-1)')).toBe('fix(x): thing (POPS-1)');
    expect(normaliseSubject('fix(x): issue #12 in the parser')).toBe(
      'fix(x): issue #12 in the parser'
    );
  });

  it('identifies a mirror whose title is the commit subject minus the PR number', () => {
    const mirrors = findMirrors(
      [
        {
          identifier: 'POPS-1575',
          title: 'fix(bfm,food,cerebrum): drop redundant 503 check in isUnavailableError copies',
          status: 'Merged',
        },
        {
          identifier: 'POPS-1452',
          title: 'bfm/food/cerebrum: drop the redundant 503 check',
          status: 'Backlog',
        },
      ],
      [FIXES_VIA_BODY_TRAILER]
    );
    expect(mirrors.map((mirror) => mirror.identifier)).toEqual(['POPS-1575']);
  });

  it('does not call a human-filed ticket a mirror on a near-miss title', () => {
    expect(
      findMirrors(
        [{ identifier: 'POPS-1', title: 'fix(x): thing but not quite', status: 'Backlog' }],
        [commit('c1', 'fix(x): thing')]
      )
    ).toEqual([]);
  });
});

describe('reconcile', () => {
  const commits = [FIXES_VIA_BODY_TRAILER, MENTIONS_FOUR_OPEN_FOLLOW_UPS];

  it('classifies only Backlog issues and skips the rest', () => {
    const report = reconcile(
      [
        backlog('POPS-1452'),
        { identifier: 'POPS-1382', title: 'x', status: 'In Progress' },
        { identifier: 'POPS-1575', title: 'y', status: 'Merged' },
      ],
      commits,
      PREFIX
    );
    expect(report.eligible.map((verdict) => verdict.identifier)).toEqual(['POPS-1452']);
    expect(report.skipped.map((issue) => issue.identifier)).toEqual(['POPS-1382', 'POPS-1575']);
  });

  it('never reports an orphan whose status is not Backlog, however strong the evidence', () => {
    const report = reconcile(
      [{ identifier: 'POPS-1452', title: 'x', status: 'Done' }],
      commits,
      PREFIX
    );
    expect(report.eligible).toEqual([]);
  });

  it('links an orphan to the mirror issue whose title claims it', () => {
    const report = reconcile(
      [
        backlog('POPS-1382', 'ios: authenticating middleware'),
        {
          identifier: 'POPS-1651',
          title: 'feat(ios): authenticating middleware with single-flight refresh (POPS-1382)',
          status: 'Merged',
        },
      ],
      commits,
      PREFIX
    );
    expect(report.eligible[0]?.mirrors).toEqual(['POPS-1651']);
  });

  it('counts the commits it scanned', () => {
    expect(reconcile([], commits, PREFIX).commitCount).toBe(2);
  });
});

describe('parseGitLog', () => {
  it('round-trips a multi-line body without splitting on its blank lines', () => {
    const raw =
      '\u001eabc\u001ffix(x): one\u001fline one\n\nline two\n' +
      '\u001edef\u001ffeat(y): two\u001f\n';
    expect(parseGitLog(raw)).toEqual([
      { sha: 'abc', subject: 'fix(x): one', body: 'line one\n\nline two\n' },
      { sha: 'def', subject: 'feat(y): two', body: '\n' },
    ]);
  });

  it('reads an empty log as no commits', () => {
    expect(parseGitLog('')).toEqual([]);
  });

  it('survives a subject that itself contains a parenthesis-heavy scope', () => {
    const raw = '\u001eabc\u001ffix(a,b): x (POPS-1) (#1)\u001f';
    expect(parseGitLog(raw)[0]?.subject).toBe('fix(a,b): x (POPS-1) (#1)');
  });
});

describe('readIssues', () => {
  it('accepts a bare array and the result envelope alike', () => {
    const entries = [{ identifier: 'POPS-1', title: 't', status: 'Backlog' }];
    expect(readIssues(entries)).toEqual(entries);
    expect(readIssues({ result: entries })).toEqual(entries);
  });

  it('refuses a shape it does not understand instead of reporting an empty backlog', () => {
    expect(() => readIssues({ issues: [] })).toThrow(/expected a JSON array/u);
    expect(() => readIssues('nope')).toThrow(/expected a JSON array/u);
  });

  // Every case below is a row the tool cannot faithfully read. Defaulting any
  // of these fields turns an unreadable export into a clean-looking one: the
  // row is skipped as not-Backlog, and a whole file of them reports zero
  // orphans over zero issues examined.
  it('rejects a row with no status rather than skipping it as not-Backlog', () => {
    expect(() => readIssues([{ identifier: 'POPS-2', title: 't' }])).toThrow(/no string "status"/u);
    expect(() => readIssues([{ identifier: 'POPS-2', title: 't', status: 3 }])).toThrow(
      /no string "status"/u
    );
  });

  it('names the offending row so the export can be fixed', () => {
    expect(() =>
      readIssues([
        { identifier: 'POPS-1', title: 't', status: 'Backlog' },
        { identifier: 'POPS-2', title: 't' },
      ])
    ).toThrow(/POPS-2 \(index 1\)/u);
  });

  it('rejects a row with no identifier rather than dropping it', () => {
    expect(() => readIssues([{ title: 'no id', status: 'Backlog' }])).toThrow(
      /index 0 has no string "identifier"/u
    );
    expect(() => readIssues([{ identifier: '  ', title: 't', status: 'Backlog' }])).toThrow(
      /no string "identifier"/u
    );
  });

  it('rejects a row with no title, because mirror detection reads it', () => {
    expect(() => readIssues([{ identifier: 'POPS-2', status: 'Backlog' }])).toThrow(
      /no string "title"/u
    );
  });

  it('rejects a non-object row', () => {
    expect(() => readIssues(['POPS-1'])).toThrow(/index 0 is not an object/u);
    expect(() => readIssues([null])).toThrow(/index 0 is not an object/u);
  });
});

describe('formatReport', () => {
  const commits = [FIXES_VIA_BODY_TRAILER, MENTIONS_FOUR_OPEN_FOLLOW_UPS];

  it('says mirrors were NOT CHECKED when no issue carried a title', () => {
    const report = reconcile(
      [{ identifier: 'POPS-1452', title: '', status: 'Backlog' }],
      commits,
      PREFIX
    );
    expect(report.titledIssueCount).toBe(0);
    expect(formatReport(report)).toContain('PR mirrors: NOT CHECKED');
  });

  it('reports a real mirror count once titles are present', () => {
    const report = reconcile(
      [
        {
          identifier: 'POPS-1575',
          title: 'fix(bfm,food,cerebrum): drop redundant 503 check in isUnavailableError copies',
          status: 'Merged',
        },
      ],
      commits,
      PREFIX
    );
    expect(formatReport(report)).toContain('PR mirrors found across the whole export: 1.');
  });

  it('names an orphan and the commit that shipped it', () => {
    const report = reconcile(
      [{ identifier: 'POPS-1452', title: 'drop the redundant check', status: 'Backlog' }],
      commits,
      PREFIX
    );
    const text = formatReport(report);
    expect(text).toContain('ORPHANS — merged work still in Backlog (1):');
    expect(text).toContain('POPS-1452');
    expect(text).toContain('body-trailer');
  });
});
