/**
 * The extension's decisions, tested.
 *
 * `pure.js` is loaded by Chrome as a classic content script, so it has no
 * exports to import. Rather than reshape it for the test — the file Chrome
 * runs would then not be the file under test — it is evaluated here exactly
 * as the browser evaluates it, and the bindings are lifted out afterwards.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

let popsPure;
let popsTemplateVault;

beforeAll(() => {
  const source = readFileSync(fileURLToPath(new URL('../pure.js', import.meta.url)), 'utf8');
  // eslint-disable-next-line no-new-func -- see the file comment: this runs
  // the shipped script the way Chrome does, without editing it for testing.
  [popsPure, popsTemplateVault] = new Function(
    `${source}\nreturn [popsPure, popsTemplateVault];`
  )();
});

const listResponse = (key, items, nextPageToken = null) => ({
  data: {
    [key]: {
      results: {
        sections: [{ sectionTitle: 'January 2026', sectionItems: items }],
        nextPageToken,
      },
    },
  },
});

const shop = (id) => ({
  activityDetailsId: id,
  description: '$23.00 at 1034 Canterbury Plaza',
  displayDate: 'Sat 24 Jan',
  transaction: { amountAsDollars: '$23.00', origin: '1034 Canterbury Plaza' },
  transactionType: 'purchase',
  receipt: { receiptId: 'r', receiptSource: 'INSTORE', analytics: { partnerName: 'Woolworths' } },
});

const pointsOnly = (id) => ({
  activityDetailsId: id,
  description: 'Bonus points',
  transactionType: 'adjustment',
  receipt: null,
});

describe('finding the list payload', () => {
  it('reads the first page and every page after it', () => {
    // THE regression. The two operations answer under different `data`
    // keys, and naming `activityHome` meant silently ignoring the whole of
    // the paginated history — which looks like an account with one page of
    // shopping rather than like a bug.
    expect(popsPure.resultsIn(listResponse('activityHome', []))).not.toBeNull();
    expect(popsPure.resultsIn(listResponse('activityHomeNextPage', []))).not.toBeNull();
  });

  it('reads a key it has never seen, because it looks for the shape', () => {
    expect(popsPure.resultsIn(listResponse('activityHomeSomethingNew', []))).not.toBeNull();
  });

  it('recognises the empty final page', () => {
    // THE other regression, and the one that cost a year of history. The
    // last page answers `{ sections: null, nextPageToken: null }`. Requiring
    // `sections` to be an array made that unreadable, so the cursor never
    // moved and the walk stopped with "the list stopped advancing" — an
    // error, on the one response that means "that was everything".
    const final = {
      data: { activityHomeNextPage: { results: { sections: null, nextPageToken: null } } },
    };
    expect(popsPure.resultsIn(final)).not.toBeNull();
    expect(popsPure.rowsFrom(final)).toEqual({ rows: [], nextPageToken: null });
  });

  it('is not fooled by a receipt response', () => {
    const receipt = { data: { activityDetails: { tabs: [] } } };
    expect(popsPure.resultsIn(receipt)).toBeNull();
  });

  it('reports nothing for junk', () => {
    for (const junk of [null, undefined, {}, { data: null }, { data: { x: { results: {} } } }]) {
      expect(popsPure.resultsIn(junk)).toBeNull();
    }
  });
});

describe('harvesting rows', () => {
  it('keeps shops and drops points adjustments', () => {
    const { rows } = popsPure.rowsFrom(
      listResponse('activityHomeNextPage', [shop('a'), pointsOnly('b'), shop('c')])
    );
    expect(rows.map((r) => r.activityDetailsId)).toEqual(['a', 'c']);
  });

  it('keeps a purchase whose row states no receipt', () => {
    // The real export came back with 45 receipts against 44 listed rows.
    // One wasted request whose answer is not stored costs nothing; a
    // purchase missing from the year with nothing to say so costs a lot.
    const receiptless = { activityDetailsId: 'x', transactionType: 'purchase', receipt: null };
    const { rows } = popsPure.rowsFrom(listResponse('activityHome', [receiptless]));
    expect(rows.map((r) => r.activityDetailsId)).toEqual(['x']);
  });

  it('carries the section it came from, so a row keeps its year', () => {
    // `displayDate` is "Sat 24 Jan" with no year; the section title has it.
    const { rows } = popsPure.rowsFrom(listResponse('activityHome', [shop('a')]));
    expect(rows[0].sectionTitle).toBe('January 2026');
    expect(rows[0].displayDate).toBe('Sat 24 Jan');
  });

  it('tells "end of history" apart from "not a list at all"', () => {
    // Confusing them makes a receipt response look like the end of the
    // list, which stops pagination halfway through a year.
    expect(popsPure.rowsFrom(listResponse('activityHome', [], null))).toEqual({
      rows: [],
      nextPageToken: null,
    });
    expect(popsPure.rowsFrom({ data: { activityDetails: {} } })).toEqual({
      rows: null,
      nextPageToken: undefined,
    });
  });

  it('passes the cursor through when there is more', () => {
    const { nextPageToken } = popsPure.rowsFrom(listResponse('activityHome', [], 'tok'));
    expect(nextPageToken).toBe('tok');
  });
});

describe('deciding what a captured query can replay', () => {
  it('recognises the paginated list by its cursor variable', () => {
    expect(popsPure.templateKind('query X($pageToken: String!) { activityHomeNextPage }')).toBe(
      'page'
    );
  });

  it('recognises a receipt request', () => {
    expect(
      popsPure.templateKind('query ActivityDetails($id: String!) { activityDetails(id: $id)')
    ).toBe('details');
  });

  it('refuses the first list page, which has no cursor to replay', () => {
    expect(
      popsPure.templateKind('query RewardsActivityHome($featureFlags: F!) { activityHome')
    ).toBeNull();
  });

  it('refuses anything else', () => {
    for (const query of ['', null, undefined, 'query Whatever { me { id } }']) {
      expect(popsPure.templateKind(query)).toBeNull();
    }
  });
});

describe('finding the receipt', () => {
  const tab = (typename) => ({ page: { __typename: typename, details: [] } });

  it('takes the ReceiptDetails tab, not the first one', () => {
    const json = {
      data: { activityDetails: { tabs: [tab('ActivityBreakdown'), tab('ReceiptDetails')] } },
    };
    expect(popsPure.receiptPageIn(json)?.__typename).toBe('ReceiptDetails');
  });

  it('reports nothing when the activity has no receipt tab', () => {
    const json = { data: { activityDetails: { tabs: [tab('ActivityBreakdown')] } } };
    expect(popsPure.receiptPageIn(json)).toBeNull();
    expect(popsPure.receiptPageIn({})).toBeNull();
  });
});

describe('reading request headers', () => {
  const expected = { client_id: 'k', Authorization: 'Bearer t' };

  it('reads a Headers instance', () => {
    expect(popsPure.headersFrom(new Headers(expected))).toEqual({
      client_id: 'k',
      authorization: 'Bearer t',
    });
  });

  it('reads an entry array and a plain object', () => {
    expect(popsPure.headersFrom(Object.entries(expected))).toEqual(expected);
    expect(popsPure.headersFrom(expected)).toEqual(expected);
  });

  it('reads nothing from nothing', () => {
    expect(popsPure.headersFrom(null)).toEqual({});
    expect(popsPure.headersFrom(undefined)).toEqual({});
  });
});

describe('the pending list', () => {
  it('is what was listed minus what was captured, in listed order', () => {
    const listed = new Map([
      ['a', {}],
      ['b', {}],
      ['c', {}],
    ]);
    expect(popsPure.pendingIds(listed, new Map([['b', {}]]))).toEqual(['a', 'c']);
    expect(popsPure.pendingIds(listed, listed)).toEqual([]);
  });
});

describe('the export', () => {
  it('pairs each receipt with the list row that mentioned it', () => {
    const listed = new Map([['a', { activityDetailsId: 'a', displayDate: 'Sat 24 Jan' }]]);
    const captured = new Map([['a', { details: [] }]]);
    const file = popsPure.exportFrom(listed, captured, '2026-08-07T00:00:00.000Z');
    expect(file).toEqual({
      source: 'woolworths-everyday-rewards',
      formatVersion: 1,
      capturedAt: '2026-08-07T00:00:00.000Z',
      receipts: [
        {
          activityDetailsId: 'a',
          listRow: { activityDetailsId: 'a', displayDate: 'Sat 24 Jan' },
          receipt: { details: [] },
        },
      ],
    });
  });

  it('exports a receipt whose list row was never seen', () => {
    const file = popsPure.exportFrom(new Map(), new Map([['a', { details: [] }]]), 'now');
    expect(file.receipts[0].listRow).toBeNull();
  });

  it('never carries the captured request, which holds the session token', () => {
    // The whole reason the vault exists. Anything in this file goes to
    // disk, and a bearer token on disk outlives every assumption about it.
    const file = popsPure.exportFrom(new Map(), new Map([['a', { details: [] }]]), 'now');
    const text = JSON.stringify(file);
    expect(text).not.toContain('Authorization');
    expect(Object.keys(file)).toEqual(['source', 'formatVersion', 'capturedAt', 'receipts']);
  });
});

describe('the template vault', () => {
  const template = {
    url: 'https://example.invalid/graphql',
    query: 'query ActivityDetails($id: String!) { activityDetails(id: $id) }',
    variables: { featureFlags: { a: true } },
    headers: { Authorization: 'Bearer secret-token', client_id: 'secret-key' },
  };

  const vaultWith = (respond) => {
    const calls = [];
    const vault = popsTemplateVault((url, init) => {
      calls.push({ url, init });
      return Promise.resolve(respond());
    });
    vault.remember('details', template);
    return { vault, calls };
  };

  const ok = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

  it('never hands the captured request back out', () => {
    // A page script that can read the token can impersonate the session.
    // It is already in the page — but on a documented global it is trivial
    // rather than deliberate.
    const { vault } = vaultWith(() => ok({ data: {} }));
    expect(JSON.stringify(vault)).not.toContain('secret-token');
    for (const key of Object.keys(vault)) {
      expect(String(vault[key])).not.toContain('secret-token');
    }
    expect(Object.keys(vault).toSorted()).toEqual(['has', 'post', 'remember']);
  });

  it('replays with the captured headers, which is what stops a 401', () => {
    const { vault, calls } = vaultWith(() => ok({ data: {} }));
    return vault.post('details', { id: 'x' }).then(() => {
      expect(calls[0].init.headers).toMatchObject(template.headers);
      expect(JSON.parse(calls[0].init.body).variables).toEqual({
        featureFlags: { a: true },
        id: 'x',
      });
    });
  });

  it('keeps the first request of a kind, not the last', () => {
    const { vault } = vaultWith(() => ok({ data: {} }));
    vault.remember('details', { ...template, url: 'https://elsewhere.invalid' });
    return vault.post('details', {}).then(() => {
      expect(vault.has('details')).toBe(true);
    });
  });

  it('ignores a query it cannot classify', () => {
    const { vault } = vaultWith(() => ok({ data: {} }));
    vault.remember(null, template);
    expect(vault.has('page')).toBe(false);
  });

  it('refuses to replay a kind it has never seen', async () => {
    const { vault } = vaultWith(() => ok({ data: {} }));
    await expect(vault.post('page', {})).rejects.toThrow(/no page request/);
  });

  it('says what to do about an expired token', async () => {
    const { vault } = vaultWith(() => ({ ok: false, status: 401 }));
    await expect(vault.post('details', {})).rejects.toThrow(/401 — reload the page/);
  });

  it('reports other HTTP failures without the reload advice', async () => {
    const { vault } = vaultWith(() => ({ ok: false, status: 500 }));
    await expect(vault.post('details', {})).rejects.toThrow(/^the site answered HTTP 500$/);
  });

  it('treats a 200 carrying GraphQL errors as a failure', async () => {
    // Absorbing one records nothing and looks exactly like a receipt with
    // no items — a silent gap in the export rather than a stop.
    const { vault } = vaultWith(() =>
      ok({ data: null, errors: [{ message: 'Api Key is empty' }] })
    );
    await expect(vault.post('details', {})).rejects.toThrow('Api Key is empty');
  });

  it('passes a clean answer through', async () => {
    const { vault } = vaultWith(() => ok({ data: { activityDetails: { tabs: [] } } }));
    await expect(vault.post('details', {})).resolves.toEqual({
      data: { activityDetails: { tabs: [] } },
    });
  });
});
