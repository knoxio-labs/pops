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
 * The two list operations put their payload under different `data` keys
 * (`activityHome` and `activityHomeNextPage`), so this reads whatever key
 * carries a `results.sections` rather than naming either.
 *
 * The app issues these over **XMLHttpRequest**, not `fetch` — verified
 * against the live site. Both are patched anyway; assuming one and being
 * wrong means capturing nothing at all.
 *
 * Runs in the MAIN world because an isolated content script gets its own
 * `fetch` and `XMLHttpRequest` and would observe nothing. That shared
 * global scope is why every binding here is prefixed.
 */

const POPS_GRAPHQL_MARK = 'graphql';
const POPS_FETCH = window.fetch;

const popsState = {
  /** activityDetailsId -> the list row that mentioned it. */
  listRows: new Map(),
  /** activityDetailsId -> captured ReceiptDetails page. */
  receipts: new Map(),
  /** A real ActivityDetails request, kept as the replay template. */
  detailsTemplate: null,
  /** A real next-page request, kept as the pagination template. */
  pageTemplate: null,
  /** Cursor from the most recent list response; null once history runs out. */
  nextPageToken: null,
  running: null,
  progress: { done: 0, total: 0 },
  error: null,
};
window.__popsEveryday = popsState;

function popsReadOperation(body) {
  try {
    return typeof body === 'string' ? JSON.parse(body) : null;
  } catch {
    return null;
  }
}

function popsFindResults(json) {
  for (const value of Object.values(json?.data ?? {})) {
    if (Array.isArray(value?.results?.sections)) return value.results;
  }
  return null;
}

function popsHarvestRow(item, sectionTitle) {
  const id = item?.activityDetailsId;
  // A row with no receipt is a points adjustment, not a shop.
  if (typeof id !== 'string' || item?.receipt == null) return;
  popsState.listRows.set(id, {
    activityDetailsId: id,
    description: item.description ?? null,
    displayDate: item.displayDate ?? null,
    sectionTitle,
    transaction: item.transaction ?? null,
    transactionType: item.transactionType ?? null,
    receiptSource: item.receipt.receiptSource ?? null,
    partnerName: item.receipt.analytics?.partnerName ?? null,
  });
}

function popsHarvestList(json) {
  const results = popsFindResults(json);
  if (results === null) return;
  // Null is meaningful: it is how the API says the history has run out.
  popsState.nextPageToken = results.nextPageToken ?? null;
  for (const section of results.sections ?? []) {
    const title = typeof section.sectionTitle === 'string' ? section.sectionTitle : null;
    for (const item of section.sectionItems ?? []) popsHarvestRow(item, title);
  }
}

/**
 * Headers are part of the template, and not optional.
 *
 * The endpoint sits behind an API key and a bearer token that the app sets
 * per request; replaying with cookies alone gets `401 Api Key is empty`.
 * They are captured from the real request rather than named here, because
 * naming them would mean guessing which ones matter and breaking the day
 * one is renamed.
 *
 * They stay in page memory and never reach the export — see
 * `popsBuildExport` in capture.js.
 */
function popsRememberTemplates(url, parsed, headers) {
  const query = parsed?.query ?? '';
  const template = { url, query, variables: parsed?.variables ?? {}, headers: headers ?? {} };
  if (popsState.detailsTemplate === null && /activityDetails\s*\(/i.test(query)) {
    popsState.detailsTemplate = template;
  }
  if (popsState.pageTemplate === null && /\$pageToken/.test(query)) {
    popsState.pageTemplate = template;
  }
}

function popsHeadersFrom(source) {
  const headers = {};
  if (source == null) return headers;
  if (typeof source.forEach === 'function' && !Array.isArray(source)) {
    source.forEach((value, name) => {
      headers[name] = value;
    });
    return headers;
  }
  for (const [name, value] of Array.isArray(source) ? source : Object.entries(source)) {
    headers[name] = value;
  }
  return headers;
}

function popsCaptureReceipt(parsed, json) {
  const id = parsed?.variables?.id;
  const details = json?.data?.activityDetails;
  if (typeof id !== 'string' || !details) return;
  const page = (details.tabs ?? []).find((tab) => tab?.page?.__typename === 'ReceiptDetails')?.page;
  if (page) popsState.receipts.set(id, page);
}

function popsAbsorb(url, parsed, json, headers) {
  popsHarvestList(json);
  popsRememberTemplates(url, parsed, headers);
  popsCaptureReceipt(parsed, json);
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
    const headers = popsHeadersFrom(
      args[1]?.headers ?? (request instanceof Request ? request.headers : null)
    );
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

// The only place an XHR's request headers are ever visible.
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
