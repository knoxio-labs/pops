/**
 * The compounding reviewer's bookkeeping.
 *
 * Every failure mode of this module renders as a clean review: a state block
 * that stopped parsing looks like a first review, an identity that shifted
 * looks like a new finding, a snippet match that stopped matching looks like a
 * fix. None of them go red on their own, so they are asserted here — including
 * the degenerate cases (empty state, corrupt state, a finding with no snippet)
 * that the naive version of each function passes.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { describe, expect, it } from 'vitest';

import {
  computeDiffRange,
  encodeState,
  emptyState,
  findingFromModel,
  findingId,
  merge,
  normalize,
  parseState,
  render,
  STATE_MARKER,
  STATE_VERSION,
  verifyStatus,
} from '../pr-review-state.mjs';

type Finding = ReturnType<typeof findingFromModel>;

function makeFinding(over: Partial<Finding> = {}): Finding {
  return {
    ...findingFromModel(
      { file: 'libs/core/src/index.ts', title: 'unchecked cast', snippet: 'as unknown as Foo' },
      'aaaaaaa1'
    ),
    ...over,
  };
}

describe('findingId', () => {
  it('is stable across reindentation of the same snippet', () => {
    expect(findingId('a.ts', 'const x = 1;')).toBe(findingId('a.ts', '  const   x  =  1;\n'));
  });

  it('changes when the file changes', () => {
    expect(findingId('a.ts', 'const x = 1;')).not.toBe(findingId('b.ts', 'const x = 1;'));
  });

  it('changes when the code changes', () => {
    expect(findingId('a.ts', 'const x = 1;')).not.toBe(findingId('a.ts', 'const x = 2;'));
  });

  it('gives every snippet-less finding in one file the same id', () => {
    expect(findingId('a.ts', null)).toBe(findingId('a.ts', undefined));
  });

  it('does not collide a snippet-less finding with an empty-string snippet', () => {
    // An empty snippet reaches `findingFromModel` as null, so the two spellings
    // must agree — otherwise the same finding gets two identities across runs.
    expect(findingFromModel({ file: 'a.ts', title: 't', snippet: '' }, 'sha').id).toBe(
      findingId('a.ts', null)
    );
  });
});

describe('findingFromModel', () => {
  it('rejects a finding with no file', () => {
    expect(() => findingFromModel({ title: 't' }, 'sha')).toThrow(TypeError);
  });

  it('rejects a finding with no title', () => {
    expect(() => findingFromModel({ file: 'a.ts' }, 'sha')).toThrow(TypeError);
  });

  it('rejects a non-object', () => {
    expect(() => findingFromModel('a string', 'sha')).toThrow(TypeError);
    expect(() => findingFromModel(null, 'sha')).toThrow(TypeError);
  });

  it('falls back to medium for a severity it does not know', () => {
    expect(
      findingFromModel({ file: 'a.ts', title: 't', severity: 'CRITICAL' }, 'sha').severity
    ).toBe('medium');
  });

  it('accepts a known severity in any case', () => {
    expect(findingFromModel({ file: 'a.ts', title: 't', severity: 'HIGH' }, 'sha').severity).toBe(
      'high'
    );
  });

  it('stamps first_seen with the reviewing sha', () => {
    expect(findingFromModel({ file: 'a.ts', title: 't' }, 'deadbee').first_seen).toBe('deadbee');
  });
});

describe('parseState', () => {
  it('returns empty state for a body with no marker', () => {
    expect(parseState('just a normal comment').findings).toHaveLength(0);
  });

  it('returns empty state for no body at all', () => {
    expect(parseState(null)).toEqual(emptyState());
    expect(parseState(undefined)).toEqual(emptyState());
    expect(parseState('')).toEqual(emptyState());
  });

  it('returns empty state for a payload that is not base64', () => {
    expect(parseState(`<!-- ${STATE_MARKER}: not!valid!base64 -->`).findings).toHaveLength(0);
  });

  it('returns empty state for base64 that is not JSON', () => {
    const payload = Buffer.from('not json at all').toString('base64');
    expect(parseState(`<!-- ${STATE_MARKER}: ${payload} -->`).findings).toHaveLength(0);
  });

  it('returns empty state for a version it does not know', () => {
    const payload = Buffer.from(
      JSON.stringify({ version: STATE_VERSION + 1, findings: [makeFinding()] })
    ).toString('base64');
    expect(parseState(`<!-- ${STATE_MARKER}: ${payload} -->`).findings).toHaveLength(0);
  });

  it('drops a malformed finding without dropping its siblings', () => {
    const good = makeFinding();
    const payload = Buffer.from(
      JSON.stringify({
        version: STATE_VERSION,
        last_reviewed_sha: 'sha',
        findings: [{ id: 'x' }, good, null, 'string'],
      })
    ).toString('base64');
    const state = parseState(`<!-- ${STATE_MARKER}: ${payload} -->`);
    expect(state.findings.map((f) => f.id)).toEqual([good.id]);
  });

  it('round-trips state through encodeState', () => {
    const state = { version: STATE_VERSION, last_reviewed_sha: 'sha1', findings: [makeFinding()] };
    expect(parseState(`<!-- ${STATE_MARKER}: ${encodeState(state)} -->`)).toEqual(state);
  });

  it('survives prose that would close the HTML comment', () => {
    // The reason the payload is base64. A raw-JSON state block is truncated by
    // the first `-->` in a finding body, and every finding is lost silently.
    const hostile = makeFinding({ body: 'this arrow --> ends the comment, and } the object' });
    const state = { version: STATE_VERSION, last_reviewed_sha: 'sha1', findings: [hostile] };
    const recovered = parseState(render(state, 'sha1', 'full'));
    expect(recovered.findings[0]?.body).toBe(hostile.body);
  });

  it('reads the last state block when a body somehow carries two', () => {
    const first = { version: STATE_VERSION, last_reviewed_sha: 'old', findings: [] };
    const body = `<!-- ${STATE_MARKER}: ${encodeState(first)} -->`;
    expect(parseState(body).last_reviewed_sha).toBe('old');
  });
});

describe('computeDiffRange', () => {
  it('reviews the full PR when nothing has been reviewed yet', () => {
    expect(computeDiffRange('base', 'head', null, () => true)).toEqual({
      range: 'base...head',
      mode: 'full',
    });
  });

  it('reviews only the new commits when the last sha is still reachable', () => {
    expect(computeDiffRange('base', 'head', 'last', () => true)).toEqual({
      range: 'last..head',
      mode: 'incremental',
    });
  });

  it('reports empty when head has not moved', () => {
    expect(computeDiffRange('base', 'head', 'head', () => true).mode).toBe('empty');
  });

  it('falls back to a full review when the last sha was rewritten away', () => {
    // A force-push leaves the recorded sha dangling; `dangling..head` is then
    // either meaningless or the whole history.
    expect(computeDiffRange('base', 'head', 'dangling', () => false)).toEqual({
      range: 'base...head',
      mode: 'full',
    });
  });

  it('treats an empty-string last sha as no state', () => {
    expect(computeDiffRange('base', 'head', '', () => true).mode).toBe('full');
  });
});

describe('verifyStatus', () => {
  it('resolves a finding whose snippet is gone', () => {
    const [f] = verifyStatus([makeFinding()], () => 'nothing like it here', 'sha2');
    expect(f).toMatchObject({ status: 'resolved', resolved_in: 'sha2' });
  });

  it('resolves a finding whose file is gone', () => {
    const [f] = verifyStatus([makeFinding()], () => null, 'sha2');
    expect(f?.status).toBe('resolved');
  });

  it('keeps a finding open while its snippet is present', () => {
    const [f] = verifyStatus([makeFinding()], () => 'x as unknown as Foo;', 'sha2');
    expect(f).toMatchObject({ status: 'open', resolved_in: null });
  });

  it('ignores whitespace differences when matching', () => {
    const [f] = verifyStatus([makeFinding()], () => 'x as\n  unknown   as Foo;', 'sha2');
    expect(f?.status).toBe('open');
  });

  it('reopens a resolved finding when the code comes back', () => {
    const prior = makeFinding({ status: 'resolved', resolved_in: 'sha2' });
    const [f] = verifyStatus([prior], () => 'as unknown as Foo', 'sha3');
    expect(f).toMatchObject({ status: 'open', resolved_in: null });
  });

  it('does not restamp resolved_in on a finding already resolved', () => {
    const prior = makeFinding({ status: 'resolved', resolved_in: 'sha2' });
    const [f] = verifyStatus([prior], () => 'gone', 'sha9');
    expect(f?.resolved_in).toBe('sha2');
  });

  it('leaves a snippet-less finding alone', () => {
    // There is nothing to look for, so the tree cannot answer. Reading "absent"
    // as "fixed" would auto-resolve every "X is missing" finding on the next run.
    const prior = makeFinding({ snippet: null, status: 'open' });
    const [f] = verifyStatus([prior], () => null, 'sha2');
    expect(f).toMatchObject({ status: 'open', resolved_in: null });
  });

  it('never reads a file for a snippet-less finding', () => {
    let reads = 0;
    verifyStatus(
      [makeFinding({ snippet: null })],
      () => {
        reads += 1;
        return null;
      },
      'sha'
    );
    expect(reads).toBe(0);
  });

  it('does not mutate its input', () => {
    const prior = makeFinding();
    verifyStatus([prior], () => null, 'sha2');
    expect(prior.status).toBe('open');
  });

  it('handles the degenerate empty set', () => {
    expect(verifyStatus([], () => null, 'sha')).toEqual([]);
  });
});

describe('merge', () => {
  it('keeps the original first_seen of a re-reported finding', () => {
    const prior = makeFinding({ first_seen: 'old-sha' });
    const again = makeFinding({ first_seen: 'new-sha', title: 'reworded' });
    const [f] = merge([prior], [again]);
    expect(f).toMatchObject({ first_seen: 'old-sha', title: 'reworded' });
  });

  it('reopens a resolved finding that is reported again', () => {
    const prior = makeFinding({ status: 'resolved', resolved_in: 'sha2' });
    const [f] = merge([prior], [makeFinding()]);
    expect(f).toMatchObject({ status: 'open', resolved_in: null });
  });

  it('appends genuinely new findings after the carried ones', () => {
    const prior = makeFinding();
    const fresh = makeFinding({ ...findingFromModel({ file: 'b.ts', title: 'other' }, 'sha') });
    expect(merge([prior], [fresh]).map((f) => f.id)).toEqual([prior.id, fresh.id]);
  });

  it('preserves carried order when nothing new arrives', () => {
    const a = makeFinding();
    const b = findingFromModel({ file: 'b.ts', title: 'b' }, 'sha');
    expect(merge([a, b], []).map((f) => f.id)).toEqual([a.id, b.id]);
  });

  it('does not mutate the prior findings', () => {
    const prior = makeFinding({ title: 'original' });
    merge([prior], [makeFinding({ title: 'reworded' })]);
    expect(prior.title).toBe('original');
  });
});

describe('render', () => {
  it('says so plainly when nothing is open', () => {
    const body = render(
      { version: STATE_VERSION, last_reviewed_sha: 'sha', findings: [] },
      'sha1234567',
      'full'
    );
    expect(body).toContain('No open findings.');
  });

  it('always embeds a readable state block', () => {
    const body = render(
      { version: STATE_VERSION, last_reviewed_sha: 'sha', findings: [] },
      'sha1234567',
      'full'
    );
    expect(parseState(body).last_reviewed_sha).toBe('sha');
  });

  it('orders open findings by severity', () => {
    const low = findingFromModel({ file: 'a.ts', title: 'low one', severity: 'low' }, 'sha');
    const high = findingFromModel({ file: 'b.ts', title: 'high one', severity: 'high' }, 'sha');
    const body = render(
      { version: STATE_VERSION, last_reviewed_sha: 'sha', findings: [low, high] },
      'sha',
      'full'
    );
    expect(body.indexOf('high one')).toBeLessThan(body.indexOf('low one'));
  });

  it('collapses resolved findings and strikes them through', () => {
    const done = makeFinding({ status: 'resolved', resolved_in: 'sha2', title: 'fixed thing' });
    const body = render(
      { version: STATE_VERSION, last_reviewed_sha: 'sha2', findings: [done] },
      'sha2',
      'incremental'
    );
    expect(body).toContain('<summary>1 resolved finding</summary>');
    expect(body).toContain('~~fixed thing~~');
    expect(body).toContain('No open findings.');
  });

  it('marks how long an open finding has been outstanding', () => {
    const old = makeFinding({ first_seen: 'abcdef1234' });
    const body = render(
      { version: STATE_VERSION, last_reviewed_sha: 'zzz', findings: [old] },
      'zzz9999999',
      'incremental'
    );
    expect(body).toContain('since `abcdef1`');
  });

  it('does not date-stamp a finding first seen on this very commit', () => {
    const fresh = makeFinding({ first_seen: 'zzz9999999' });
    const body = render(
      { version: STATE_VERSION, last_reviewed_sha: 'zzz9999999', findings: [fresh] },
      'zzz9999999',
      'full'
    );
    expect(body).not.toContain('since');
  });

  it('counts in the plural only when it should', () => {
    const one = render(
      { version: STATE_VERSION, last_reviewed_sha: 's', findings: [makeFinding()] },
      's',
      'full'
    );
    expect(one).toContain('1 open finding.');
    const two = render(
      {
        version: STATE_VERSION,
        last_reviewed_sha: 's',
        findings: [makeFinding(), findingFromModel({ file: 'b.ts', title: 'b' }, 's')],
      },
      's',
      'full'
    );
    expect(two).toContain('2 open findings.');
  });
});

describe('normalize', () => {
  it('collapses every run of whitespace to one space', () => {
    expect(normalize('  a\n\t b  ')).toBe('a b');
  });

  it('leaves an empty string empty', () => {
    expect(normalize('   \n ')).toBe('');
  });
});
