/**
 * Replaying what `observe.js` learned.
 *
 * Both loops here reuse a captured query verbatim and substitute one
 * variable — a page token, or a receipt id. Nothing about the schema is
 * restated, so a field the site adds tomorrow lands in the export without
 * this file changing.
 *
 * Both are sequential and paced. This is someone's account rather than a
 * load target, and a burst of parallel requests is both rude and the
 * fastest way to get rate-limited half-way through a year of history.
 */

const POPS_REQUEST_GAP_MS = 350;
/** Backstop against a server that keeps handing back a token forever. */
const POPS_MAX_PAGES = 200;

async function popsPost(template, variables) {
  const response = await POPS_FETCH.call(window, template.url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: template.query,
      variables: { ...template.variables, ...variables },
    }),
  });
  if (!response.ok) throw new Error(`the site answered HTTP ${String(response.status)}`);
  return response.json();
}

function popsPause() {
  return new Promise((resolve) => setTimeout(resolve, POPS_REQUEST_GAP_MS));
}

function popsPendingIds() {
  return [...popsState.listRows.keys()].filter((id) => !popsState.receipts.has(id));
}

/** Walk the list to the end of history, one page token at a time. */
async function popsPaginate() {
  if (popsState.pageTemplate === null) {
    throw new Error(
      'Scroll the activity list once — that is where the pagination request comes from.'
    );
  }
  for (let page = 0; page < POPS_MAX_PAGES; page += 1) {
    const token = popsState.nextPageToken;
    if (token == null) return;
    popsState.progress = { done: popsState.listRows.size, total: 0 };
    // popsAbsorb, driven by the patched fetch, advances nextPageToken.
    await popsPost(popsState.pageTemplate, { pageToken: token });
    if (popsState.nextPageToken === token) {
      throw new Error('the list stopped advancing; its cursor repeated');
    }
    await popsPause();
  }
}

/** Fetch every listed receipt not captured yet. */
async function popsFetchReceipts() {
  if (popsState.detailsTemplate === null) {
    throw new Error('Open one receipt first — that teaches the extension the request to replay.');
  }
  const pending = popsPendingIds();
  popsState.progress = { done: 0, total: pending.length };
  for (const id of pending) {
    await popsPost(popsState.detailsTemplate, { id });
    popsState.progress = { done: popsState.progress.done + 1, total: pending.length };
    await popsPause();
  }
}

/**
 * Run one phase, holding partial progress if it fails.
 *
 * Receipts already captured stay captured and stay exportable, and the next
 * run resumes from there rather than starting over — which matters most
 * exactly when it went wrong half-way through a year of history.
 */
async function popsRun(phase, work) {
  if (popsState.running !== null) return;
  popsState.running = phase;
  popsState.error = null;
  try {
    await work();
  } catch (error) {
    const done = String(popsState.progress.done);
    popsState.error = `Stopped after ${done} — ${String(error?.message ?? error)}`;
  } finally {
    popsState.running = null;
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
  pending: popsPendingIds().length,
  hasDetailsTemplate: popsState.detailsTemplate !== null,
  hasPageTemplate: popsState.pageTemplate !== null,
  moreHistory: popsState.nextPageToken != null,
  running: popsState.running,
  progress: popsState.progress,
  error: popsState.error,
});
popsState.loadHistory = () => popsRun('history', popsPaginate);
popsState.fetchAll = () => popsRun('receipts', popsFetchReceipts);
popsState.buildExport = popsBuildExport;
