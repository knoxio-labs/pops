/**
 * The wiring, driven end to end against fakes.
 *
 * `pure.test.js` covers the decisions; this covers the parts that only
 * exist because there is a browser — patching `XMLHttpRequest`, learning a
 * template from an observed request, and the two replay loops. Both bugs
 * that survived into real use were in the pagination loop's idea of where a
 * history ends, which is what most of this file is about.
 */
import { describe, expect, it } from 'vitest';

import {
  bootExtension,
  DETAILS_QUERY,
  GRAPHQL_URL,
  httpError,
  listPage,
  observeXhr,
  okJson,
  PAGE_QUERY,
  receiptResponse,
} from './harness.js';

const AUTH = { client_id: 'key', Authorization: 'Bearer session-token' };

/** Boot, then observe one list page and one receipt, as a real session does. */
function primed({ pages = {}, receipts = true } = {}) {
  const booted = bootExtension({
    respond: async (body) => {
      if (typeof body.variables.pageToken === 'string') {
        const answer = pages[body.variables.pageToken];
        return answer === undefined ? okJson({ data: {} }) : answer;
      }
      return receipts ? okJson(receiptResponse(body.variables.id)) : httpError(500);
    },
    xhrRespond: (body) =>
      typeof body?.variables?.pageToken === 'string'
        ? listPage(['a', 'b'], 'token-1')
        : receiptResponse('observed'),
  });

  observeXhr(booted.XMLHttpRequest, {
    url: GRAPHQL_URL,
    query: PAGE_QUERY,
    variables: { pageToken: 'token-0', featureFlags: { f: true } },
    headers: AUTH,
  });
  observeXhr(booted.XMLHttpRequest, {
    url: GRAPHQL_URL,
    query: DETAILS_QUERY,
    variables: { id: 'seen', featureFlags: { f: true } },
    headers: AUTH,
  });
  return booted;
}

describe('observing the app', () => {
  it('learns both requests and harvests the list from one XHR each', () => {
    const { api } = primed();
    const status = api.status();
    expect(status.hasPageTemplate).toBe(true);
    expect(status.hasDetailsTemplate).toBe(true);
    expect(status.listed).toBe(2);
    expect(status.captured).toBe(1);
  });

  it('reports nothing learned before the app has spoken', () => {
    const { api } = bootExtension({ respond: async () => okJson({}), xhrRespond: () => ({}) });
    expect(api.status()).toMatchObject({
      listed: 0,
      captured: 0,
      hasPageTemplate: false,
      hasDetailsTemplate: false,
      // No list has been read, so whether more exists is unknown — and
      // claiming there is none would grey out the button that finds out.
      moreHistory: true,
    });
  });

  it('does not break the page on a response it cannot read', () => {
    const { XMLHttpRequest } = bootExtension({
      respond: async () => okJson({}),
      xhrRespond: () => ({}),
    });
    const xhr = new XMLHttpRequest();
    xhr.open('POST', GRAPHQL_URL);
    expect(() => {
      xhr.responseText = 'not json';
      xhr.send(null);
    }).not.toThrow();
  });

  it('leaves non-GraphQL traffic alone', () => {
    const { api, XMLHttpRequest } = primed();
    observeXhr(XMLHttpRequest, {
      url: 'https://example.invalid/analytics',
      query: PAGE_QUERY,
      variables: { pageToken: 'nope' },
    });
    expect(api.status().listed).toBe(2);
  });
});

describe('walking the history', () => {
  it('follows the cursor to the end and finishes quietly', async () => {
    const { api, fetchCalls } = primed({
      pages: {
        'token-1': okJson(listPage(['c'], 'token-2')),
        'token-2': okJson(listPage(['d'], null)),
      },
    });

    await api.loadHistory();

    expect(api.status().error).toBeNull();
    expect(api.status().listed).toBe(4);
    expect(api.status().moreHistory).toBe(false);
    expect(fetchCalls.map((c) => c.body.variables.pageToken)).toEqual(['token-1', 'token-2']);
  });

  it('carries the app’s auth headers into every replay', async () => {
    // Without them the endpoint answers `401 Api Key is empty`, which is
    // exactly what the first version of this did.
    const { api, fetchCalls } = primed({ pages: { 'token-1': okJson(listPage(['c'], null)) } });
    await api.loadHistory();
    expect(fetchCalls[0].init.headers).toMatchObject(AUTH);
  });

  it('keeps the variables the app sent alongside the substituted cursor', async () => {
    const { api, fetchCalls } = primed({ pages: { 'token-1': okJson(listPage(['c'], null)) } });
    await api.loadHistory();
    expect(fetchCalls[0].body.variables).toEqual({
      featureFlags: { f: true },
      pageToken: 'token-1',
    });
  });

  it('stops quietly when the answer carries no list at all', async () => {
    // THE reported bug. The end of a history has been seen as a null
    // cursor, as an empty final page, and as this — a response with no list
    // in it. Recognising only the first ended a COMPLETED walk with "the
    // list stopped advancing", which reads as lost history.
    const { api } = primed({
      pages: { 'token-1': okJson({ data: { activityHomeNextPage: null } }) },
    });
    await api.loadHistory();
    expect(api.status().error).toBeNull();
  });

  it('stops claiming there is more once there is not', async () => {
    // Ending on an unreadable answer used to leave the cursor set, so the
    // popup kept telling the user to load a history it had just finished
    // loading — and kept the button live to do it again.
    const { api } = primed({
      pages: { 'token-1': okJson({ data: { activityHomeNextPage: null } }) },
    });
    await api.loadHistory();
    expect(api.status().moreHistory).toBe(false);
  });

  it('stops quietly on an empty final page', async () => {
    const empty = {
      data: { activityHomeNextPage: { results: { sections: null, nextPageToken: null } } },
    };
    const { api } = primed({ pages: { 'token-1': okJson(empty) } });
    await api.loadHistory();
    expect(api.status()).toMatchObject({ error: null, moreHistory: false });
  });

  it('still refuses to loop on a cursor that genuinely repeats', async () => {
    // A server handing back the same token forever would otherwise be
    // walked until the account is rate-limited.
    const { api } = primed({ pages: { 'token-1': okJson(listPage(['c'], 'token-1')) } });
    await api.loadHistory();
    expect(api.status().error).toMatch(/cursor repeated/);
  });

  it('keeps the rows it already read when a page fails', async () => {
    const { api } = primed({ pages: { 'token-1': httpError(500) } });
    await api.loadHistory();
    expect(api.status().listed).toBe(2);
    expect(api.status().error).toMatch(/HTTP 500/);
  });

  it('says what to do when the session token has expired', async () => {
    const { api } = primed({ pages: { 'token-1': httpError(401) } });
    await api.loadHistory();
    expect(api.status().error).toMatch(/reload the page/);
  });

  it('does nothing, quietly, before any list has been read', async () => {
    // There is no cursor to follow yet, so there is nothing to do and
    // nothing to report. The popup keeps the button disabled in this state;
    // reaching it anyway must not manufacture an error.
    const { api, fetchCalls } = bootExtension({
      respond: async () => okJson({}),
      xhrRespond: () => ({}),
    });
    await api.loadHistory();
    expect(fetchCalls).toEqual([]);
    expect(api.status().error).toBeNull();
  });
});

describe('fetching the receipts', () => {
  it('asks only for what is missing, and reports progress as it goes', async () => {
    const { api, fetchCalls } = primed({ pages: {} });
    await api.fetchAll();

    // 'seen' was captured by observation; only 'a' and 'b' were pending.
    expect(fetchCalls.map((c) => c.body.variables.id)).toEqual(['a', 'b']);
    expect(api.status()).toMatchObject({ captured: 3, pending: 0, running: null });
    expect(api.status().progress).toEqual({ done: 2, total: 2 });
  });

  it('stops offering rows that turned out to have no receipt', async () => {
    // With the row filter widened, points adjustments are asked about too.
    // They never yield a receipt, so without remembering that they were
    // asked, the popup offers to fetch them again forever.
    const booted = bootExtension({
      respond: async () => okJson({ data: { activityDetails: { tabs: [] } } }),
      xhrRespond: (body) =>
        typeof body?.variables?.pageToken === 'string'
          ? listPage(['a', 'b'], null)
          : receiptResponse('observed'),
    });
    observeXhr(booted.XMLHttpRequest, {
      url: GRAPHQL_URL,
      query: PAGE_QUERY,
      variables: { pageToken: 't' },
    });
    observeXhr(booted.XMLHttpRequest, {
      url: GRAPHQL_URL,
      query: DETAILS_QUERY,
      variables: { id: 'seen' },
    });

    await booted.api.fetchAll();

    expect(booted.api.status()).toMatchObject({ listed: 2, captured: 1, pending: 0 });
  });

  it('resumes rather than restarting after a failure', async () => {
    const { api } = primed({ receipts: false });
    await api.fetchAll();
    expect(api.status().error).toMatch(/HTTP 500/);
    // Nothing new was captured, so everything is still pending — the next
    // run repeats the work rather than skipping past it.
    expect(api.status().pending).toBe(2);
  });

  it('does nothing, quietly, when nothing is pending', async () => {
    const { api, fetchCalls } = bootExtension({
      respond: async () => okJson({}),
      xhrRespond: () => ({}),
    });
    await api.fetchAll();
    expect(fetchCalls).toEqual([]);
    expect(api.status().error).toBeNull();
  });

  it('reports the missing request if a receipt is pending and none was observed', async () => {
    // Reachable only if a list arrives without the user having opened a
    // receipt — the popup says so rather than leaving the button dead.
    const booted = bootExtension({
      respond: async () => okJson({}),
      xhrRespond: () => listPage(['a'], null),
    });
    observeXhr(booted.XMLHttpRequest, {
      url: GRAPHQL_URL,
      query: PAGE_QUERY,
      variables: { pageToken: 't' },
    });
    await booted.api.fetchAll();
    expect(booted.api.status().error).toMatch(/no details request/);
  });

  it('ignores a second run while one is going', async () => {
    const { api, fetchCalls } = primed({ pages: {} });
    const first = api.fetchAll();
    await api.fetchAll();
    await first;
    expect(fetchCalls).toHaveLength(2);
  });
});

describe('the export', () => {
  it('carries every captured receipt with the row that listed it', async () => {
    const { api } = primed({ pages: {} });
    await api.fetchAll();
    const file = api.buildExport();
    expect(file.receipts.map((r) => r.activityDetailsId).toSorted()).toEqual(['a', 'b', 'seen']);
    expect(file.receipts.find((r) => r.activityDetailsId === 'a')?.listRow).toMatchObject({
      partnerName: 'Woolworths',
      sectionTitle: 'January 2026',
    });
  });

  it('never carries the session token', async () => {
    // The whole reason the templates live in a closure. This file goes to
    // disk, and a bearer token on disk outlives every assumption about it.
    const { api } = primed({ pages: {} });
    await api.fetchAll();
    const text = JSON.stringify(api.buildExport());
    expect(text).not.toContain('session-token');
    expect(text).not.toContain('Authorization');
  });
});

describe('the public surface', () => {
  it('exposes four methods and nothing else', () => {
    const { api } = primed();
    expect(Object.keys(api).toSorted()).toEqual([
      'buildExport',
      'fetchAll',
      'loadHistory',
      'status',
    ]);
    expect(Object.isFrozen(api)).toBe(true);
  });

  it('hands out no object a page script could read a header from', () => {
    const { api } = primed();
    expect(JSON.stringify(api.status())).not.toContain('session-token');
  });
});
