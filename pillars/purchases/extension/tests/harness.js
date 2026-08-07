/**
 * Running the extension outside a browser.
 *
 * `observe.js` and `capture.js` are classic content scripts sharing one
 * global scope, so they cannot be imported. They are concatenated and
 * evaluated exactly as Chrome evaluates them — the file under test is the
 * file that ships — with `window`, `XMLHttpRequest` and `Request` supplied
 * as parameters so the fakes below take the place of the browser's.
 *
 * `pure.js` goes first, as the manifest declares.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const SCRIPTS = ['pure.js', 'observe.js', 'capture.js'];

/**
 * The shipped scripts, with their pacing constants overridden.
 *
 * The 350ms courtesy gap and the 200-page backstop are right for someone's
 * account and wrong for a test suite — walking to the backstop at real
 * pacing takes over a minute. Only those two literals are substituted, and
 * each substitution is asserted, so this cannot quietly stop applying or
 * quietly start rewriting something else.
 */
function source({ gapMs = 0, maxPages = 200 } = {}) {
  const text = SCRIPTS.map((name) =>
    readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8')
  ).join('\n');

  const replacements = [
    ['const POPS_REQUEST_GAP_MS = 350;', `const POPS_REQUEST_GAP_MS = ${String(gapMs)};`],
    ['const POPS_MAX_PAGES = 200;', `const POPS_MAX_PAGES = ${String(maxPages)};`],
  ];

  return replacements.reduce((carried, [from, to]) => {
    if (!carried.includes(from)) {
      throw new Error(`the harness can no longer find \`${from}\` to override`);
    }
    return carried.replace(from, to);
  }, text);
}

/** Enough of `XMLHttpRequest` for the patches to have something to patch. */
function fakeXhrClass(onSend) {
  return class FakeXhr {
    constructor() {
      this.listeners = [];
      this.responseText = '';
    }

    open(method, url) {
      this.method = method;
      this.url = url;
    }

    setRequestHeader(name, value) {
      this.sentHeaders = { ...this.sentHeaders, [name]: value };
    }

    addEventListener(event, handler) {
      if (event === 'load') this.listeners.push(handler);
    }

    send(body) {
      this.responseText = JSON.stringify(onSend(this.url, body));
      for (const handler of this.listeners) handler();
    }
  };
}

/**
 * Boot the extension against fakes.
 *
 * `respond` answers a replayed `fetch`; `xhrRespond` answers an observed
 * `XMLHttpRequest`. Both receive the parsed request so a test can vary its
 * answer by page token or receipt id.
 */
export function bootExtension({ respond, xhrRespond, gapMs, maxPages } = {}) {
  const fetchCalls = [];
  const window = {
    async fetch(url, init) {
      fetchCalls.push({ url, init, body: JSON.parse(init.body) });
      return respond(JSON.parse(init.body), url, init);
    },
  };

  const XMLHttpRequestStub = fakeXhrClass((url, body) =>
    xhrRespond(body === null ? null : JSON.parse(body), url)
  );

  // A real realm rather than a wrapper function: the scripts declare
  // top-level `const`s and expect a global `window`, which is exactly what
  // a vm context provides. `setTimeout` has to be handed over because a
  // context gets JavaScript's built-ins, not Node's.
  const context = createContext({
    window,
    XMLHttpRequest: XMLHttpRequestStub,
    Request: class Request {},
    setTimeout,
  });
  runInContext(source({ gapMs, maxPages }), context);

  return {
    api: window.__popsEveryday,
    patchedFetch: window.fetch,
    fetchCalls,
    XMLHttpRequest: XMLHttpRequestStub,
    window,
  };
}

/** Drive one observed request through the patched `XMLHttpRequest`. */
export function observeXhr(XMLHttpRequestStub, { url, query, variables, headers = {} }) {
  const xhr = new XMLHttpRequestStub();
  xhr.open('POST', url);
  for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
  xhr.send(JSON.stringify({ query, variables }));
  return xhr;
}

export const okJson = (body) => ({ ok: true, status: 200, json: async () => body });
export const httpError = (status) => ({ ok: false, status });

export const GRAPHQL_URL = 'https://apigee-prod.api-wr.com/wx/v1/bff/graphql';
export const PAGE_QUERY = 'query RewardsActivityHomeNextPage($pageToken: String!) { x }';
export const DETAILS_QUERY =
  'query ActivityDetails($id: String!) { activityDetails(id: $id) { y } }';

export const listPage = (ids, nextPageToken) => ({
  data: {
    activityHomeNextPage: {
      results: {
        sections: [
          {
            sectionTitle: 'January 2026',
            sectionItems: ids.map((id) => ({
              activityDetailsId: id,
              transactionType: 'purchase',
              receipt: { receiptSource: 'INSTORE', analytics: { partnerName: 'Woolworths' } },
            })),
          },
        ],
        nextPageToken,
      },
    },
  },
});

export const receiptResponse = (marker) => ({
  data: {
    activityDetails: {
      tabs: [
        { page: { __typename: 'ActivityBreakdown' } },
        { page: { __typename: 'ReceiptDetails', marker } },
      ],
    },
  },
});
