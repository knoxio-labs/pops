/**
 * Observe, then replay.
 *
 * Everyday Rewards publishes no export, so the only way to get receipts is
 * the session the user is already logged into. Two GraphQL operations
 * matter, and this script treats them differently on purpose:
 *
 *   activityHome    — the transaction list. OBSERVED, never replayed. Its
 *                     query declares only `$featureFlags`, so pagination is
 *                     not reproducible from the query alone; the page knows
 *                     how to page and this script simply records what it
 *                     fetches as the user scrolls.
 *
 *   ActivityDetails — one receipt, by id. REPLAYED, using the query text
 *                     and variables captured from a real request with only
 *                     the id substituted. Nothing about the schema is
 *                     hardcoded here, so a field the site adds tomorrow
 *                     arrives in the export without this file changing.
 *
 * Read-only. It issues the same request the page issues when you open a
 * receipt, and writes nothing back to Woolworths.
 *
 * Runs in the MAIN world because it has to see the page's own `fetch` and
 * `XMLHttpRequest`; an isolated content script would patch a different pair
 * and observe nothing. That shared global scope is also why every binding
 * here is prefixed — a bare `state` would be a collision waiting to happen.
 */

const POPS_GRAPHQL_MARK = 'graphql';
const POPS_FETCH = window.fetch;

const popsState = {
  /** activityDetailsId -> the list row that mentioned it. */
  listRows: new Map(),
  /** A real ActivityDetails request, kept as the replay template. */
  template: null,
  /** activityDetailsId -> captured ReceiptDetails page. */
  receipts: new Map(),
  running: false,
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

function popsSectionTitle(section) {
  const title = section.sectionTitle;
  if (typeof title === 'string') return title;
  return title?.title ?? null;
}

function popsHarvestRow(item, section) {
  const id = item?.activityDetailsId ?? item?.id;
  // A row with no receipt is a points adjustment, not a shop.
  if (typeof id !== 'string' || item?.receipt == null) return;
  popsState.listRows.set(id, {
    activityDetailsId: id,
    description: item.description ?? null,
    displayDate: item.displayDate ?? null,
    sectionTitle: popsSectionTitle(section),
    transaction: item.transaction ?? null,
    transactionType: item.transactionType ?? null,
  });
}

function popsHarvestList(json) {
  const sections = json?.data?.activityHome?.results?.sections ?? [];
  for (const section of sections) {
    for (const item of section.sectionItems ?? []) popsHarvestRow(item, section);
  }
}

function popsRememberTemplate(url, parsed) {
  if (popsState.template !== null) return;
  if (!/activityDetails\s*\(/i.test(parsed?.query ?? '')) return;
  popsState.template = { url, query: parsed.query, variables: parsed.variables ?? {} };
}

function popsCaptureReceipt(parsed, json) {
  const id = parsed?.variables?.id;
  const details = json?.data?.activityDetails;
  if (typeof id !== 'string' || !details) return;
  const page = (details.tabs ?? []).find((tab) => tab?.page?.__typename === 'ReceiptDetails')?.page;
  if (page) popsState.receipts.set(id, page);
}

function popsAbsorb(url, parsed, json) {
  popsHarvestList(json);
  popsRememberTemplate(url, parsed);
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
    popsAbsorb(url, parsed, await response.clone().json());
  } catch {
    // A GraphQL call this script cannot read is not a reason to break the
    // page it belongs to.
  }
  return response;
};

const POPS_XHR_OPEN = XMLHttpRequest.prototype.open;
const POPS_XHR_SEND = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function popsPatchedOpen(method, url, ...rest) {
  this.__popsUrl = url;
  return POPS_XHR_OPEN.call(this, method, url, ...rest);
};

XMLHttpRequest.prototype.send = function popsPatchedSend(body) {
  if (typeof this.__popsUrl === 'string' && this.__popsUrl.includes(POPS_GRAPHQL_MARK)) {
    this.addEventListener('load', () => {
      try {
        popsAbsorb(this.__popsUrl, popsReadOperation(body), JSON.parse(this.responseText));
      } catch {
        // As above.
      }
    });
  }
  return POPS_XHR_SEND.call(this, body);
};

async function popsFetchOne(id) {
  const response = await POPS_FETCH.call(window, popsState.template.url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: popsState.template.query,
      variables: { ...popsState.template.variables, id },
    }),
  });
  if (!response.ok) throw new Error(`the site answered HTTP ${String(response.status)}`);
  popsCaptureReceipt({ variables: { id } }, await response.json());
}

/**
 * Fetch every listed receipt not yet seen.
 *
 * Sequential and paced. This is someone's account rather than a load
 * target, and a burst of parallel requests is both rude and the fastest way
 * to get rate-limited half-way through a year of history.
 */
async function popsFetchAll() {
  if (popsState.template === null) {
    throw new Error('Open one receipt first — that teaches the extension the request to replay.');
  }
  if (popsState.running) return;
  popsState.running = true;
  popsState.error = null;
  const pending = [...popsState.listRows.keys()].filter((id) => !popsState.receipts.has(id));
  popsState.progress = { done: 0, total: pending.length };
  try {
    for (const id of pending) {
      await popsFetchOne(id);
      popsState.progress = { done: popsState.progress.done + 1, total: pending.length };
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  } catch (error) {
    // Partial progress is kept on purpose: the receipts already captured are
    // still exportable, and a second run resumes rather than starting over.
    const done = String(popsState.progress.done);
    popsState.error = `Stopped after ${done} of ${String(pending.length)} — ${String(error?.message ?? error)}`;
  } finally {
    popsState.running = false;
  }
}

function popsBuildExport() {
  const receipts = [...popsState.receipts].map(([id, page]) => ({
    activityDetailsId: id,
    listRow: popsState.listRows.get(id) ?? null,
    receipt: page,
  }));
  return {
    source: 'woolworths-everyday-rewards',
    formatVersion: 1,
    capturedAt: new Date().toISOString(),
    receipts,
  };
}

// The popup drives these through chrome.scripting in the MAIN world, so they
// are plain functions rather than a message protocol.
popsState.status = () => ({
  listed: popsState.listRows.size,
  captured: popsState.receipts.size,
  pending: [...popsState.listRows.keys()].filter((id) => !popsState.receipts.has(id)).length,
  hasTemplate: popsState.template !== null,
  running: popsState.running,
  progress: popsState.progress,
  error: popsState.error,
});
popsState.fetchAll = popsFetchAll;
popsState.buildExport = popsBuildExport;
