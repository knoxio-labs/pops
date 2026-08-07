/**
 * Watching the app talk to its own API.
 *
 * Everything the extension knows comes from here. Three GraphQL operations
 * matter, all on `POST https://apigee-prod.api-wr.com/wx/v1/bff/graphql`:
 *
 *   RewardsActivityHome         first page of the activity list. Takes only
 *                               `$featureFlags`. Fires once, at page load.
 *   RewardsActivityHomeNextPage the rest of the list. Takes `$pageToken`,
 *                               returns the next one — so once one of these
 *                               has been seen, the whole history can be
 *                               walked without further scrolling.
 *   ActivityDetails             one receipt, by `$id`.
 *
 * The app issues these over **XMLHttpRequest**, not `fetch` — verified
 * against the live site. Both are patched anyway; assuming one and being
 * wrong means capturing nothing at all.
 *
 * The captured requests go into `popsVault`, which never gives them back:
 * they carry the session's auth headers. See `pure.js`.
 *
 * Runs in the MAIN world because an isolated content script gets its own
 * `fetch` and `XMLHttpRequest` and would observe nothing. That shared
 * global scope is why every binding here is prefixed.
 */

const POPS_GRAPHQL_MARK = 'graphql';
const POPS_FETCH = window.fetch.bind(window);
const popsVault = popsTemplateVault(POPS_FETCH);

/** What the popup is allowed to see. Deliberately not the templates. */
const popsState = {
  listRows: new Map(),
  receipts: new Map(),
  /** Rows asked about that had no receipt. See `popsPure.pendingIds`. */
  answered: new Set(),
  /** `null` until a list response has been read; `null` again at the end. */
  nextPageToken: null,
  seenAList: false,
  running: null,
  progress: { done: 0, total: 0 },
  error: null,
};

function popsReadOperation(body) {
  try {
    return typeof body === 'string' ? JSON.parse(body) : null;
  } catch {
    return null;
  }
}

function popsAbsorb(url, parsed, json, headers) {
  const { rows, nextPageToken } = popsPure.rowsFrom(json);
  if (rows !== null) {
    popsState.seenAList = true;
    popsState.nextPageToken = nextPageToken;
    for (const row of rows) popsState.listRows.set(row.activityDetailsId, row);
  }

  popsVault.remember(popsPure.templateKind(parsed?.query), {
    url,
    query: parsed?.query ?? '',
    variables: parsed?.variables ?? {},
    headers: popsPure.headersFrom(headers),
  });

  const id = parsed?.variables?.id;
  const page = popsPure.receiptPageIn(json);
  if (typeof id === 'string' && page !== null) popsState.receipts.set(id, page);
}

async function popsRequestBody(request, init) {
  if (init?.body != null) return init.body;
  if (!(request instanceof Request)) return null;
  try {
    return await request.clone().text();
  } catch {
    return null;
  }
}

window.fetch = async function popsPatchedFetch(...args) {
  const response = await POPS_FETCH.apply(this, args);
  const request = args[0];
  const url = typeof request === 'string' ? request : request?.url;
  if (typeof url !== 'string' || !url.includes(POPS_GRAPHQL_MARK)) return response;
  try {
    const parsed = popsReadOperation(await popsRequestBody(request, args[1]));
    const headers = args[1]?.headers ?? (request instanceof Request ? request.headers : null);
    popsAbsorb(url, parsed, await response.clone().json(), headers);
  } catch {
    // A GraphQL call this script cannot read is not a reason to break the
    // page it belongs to.
  }
  return response;
};

const POPS_XHR_OPEN = XMLHttpRequest.prototype.open;
const POPS_XHR_SEND = XMLHttpRequest.prototype.send;
const POPS_XHR_HEADER = XMLHttpRequest.prototype.setRequestHeader;

XMLHttpRequest.prototype.open = function popsPatchedOpen(method, url, ...rest) {
  this.__popsUrl = url;
  this.__popsHeaders = {};
  return POPS_XHR_OPEN.call(this, method, url, ...rest);
};

// The only place an XHR's request headers are ever visible — and without
// them a replay answers 401.
XMLHttpRequest.prototype.setRequestHeader = function popsPatchedHeader(name, value) {
  if (this.__popsHeaders) this.__popsHeaders[name] = value;
  return POPS_XHR_HEADER.call(this, name, value);
};

XMLHttpRequest.prototype.send = function popsPatchedSend(body) {
  if (typeof this.__popsUrl === 'string' && this.__popsUrl.includes(POPS_GRAPHQL_MARK)) {
    this.addEventListener('load', () => {
      try {
        const json = JSON.parse(this.responseText);
        popsAbsorb(this.__popsUrl, popsReadOperation(body), json, this.__popsHeaders);
      } catch {
        // As above.
      }
    });
  }
  return POPS_XHR_SEND.call(this, body);
};
