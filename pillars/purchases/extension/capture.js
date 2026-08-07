/**
 * Replaying what `observe.js` learned.
 *
 * Both loops here ask `popsVault` to reissue a captured request with one
 * variable substituted — a page token, or a receipt id. The query text is
 * reused verbatim, so nothing about the schema is restated here and a field
 * the site adds tomorrow lands in the export without this file changing.
 *
 * Both are sequential and paced. This is someone's account rather than a
 * load target, and a burst of parallel requests is both rude and the
 * fastest way to get rate-limited half-way through a year of history.
 *
 * The last statement of this file is the extension's only public surface.
 */

const POPS_REQUEST_GAP_MS = 350;
/** Backstop against a server that keeps handing back a token forever. */
const POPS_MAX_PAGES = 200;

function popsPause() {
  return new Promise((resolve) => setTimeout(resolve, POPS_REQUEST_GAP_MS));
}

/**
 * Walk the list to the end of history, one page token at a time.
 *
 * The end of a history is not one shape. It has been observed as a null
 * cursor, as an empty final page, and as a response carrying no list at
 * all — so the loop stops on any answer it cannot read a page out of, and
 * only calls it an error when it reads a real page whose cursor has not
 * moved. Asking "did the state change?" instead conflated the two and
 * ended a completed walk with a failure message.
 */
async function popsPaginate() {
  for (let page = 0; page < POPS_MAX_PAGES; page += 1) {
    const token = popsState.nextPageToken;
    if (token == null) return;
    popsState.progress = { done: popsState.listRows.size, total: 0 };
    const { rows, nextPageToken } = popsAbsorbReplay(
      await popsVault.post('page', { pageToken: token })
    );
    if (rows === null) {
      // An answer with no list in it is the end. Leaving the cursor set
      // would keep `moreHistory` true, so the popup would go on insisting
      // there is history to load after loading all of it.
      popsState.nextPageToken = null;
      return;
    }
    if (nextPageToken === token) {
      throw new Error('the list stopped advancing; its cursor repeated');
    }
    await popsPause();
  }
}

/** Fetch every listed receipt not captured yet. */
async function popsFetchReceipts() {
  const pending = popsPure.pendingIds(popsState.listRows, popsState.receipts, popsState.answered);
  popsState.progress = { done: 0, total: pending.length };
  for (const id of pending) {
    popsAbsorbReplay(await popsVault.post('details', { id }), id);
    // Asked and answered. A row with no receipt — a points adjustment —
    // must not stay pending, or the popup offers it again forever.
    popsState.answered.add(id);
    popsState.progress = { done: popsState.progress.done + 1, total: pending.length };
    await popsPause();
  }
}

/**
 * A replayed answer goes through the same reading as an observed one.
 *
 * The vault uses the original `fetch` deliberately: routing a replay
 * through the patched one would recurse, and would only work at all if the
 * site used `fetch` — which it does not.
 */
function popsAbsorbReplay(json, id) {
  const read = popsPure.rowsFrom(json);
  if (read.rows !== null) {
    popsState.nextPageToken = read.nextPageToken;
    for (const row of read.rows) popsState.listRows.set(row.activityDetailsId, row);
  }
  const page = popsPure.receiptPageIn(json);
  if (typeof id === 'string' && page !== null) popsState.receipts.set(id, page);
  return read;
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

// The popup drives these through chrome.scripting in the MAIN world, so
// they are plain functions rather than a message protocol. Frozen, and
// carrying no templates: those hold the session's auth headers and stay
// inside the vault's closure.
window.__popsEveryday = Object.freeze({
  status: () => ({
    listed: popsState.listRows.size,
    captured: popsState.receipts.size,
    pending: popsPure.pendingIds(popsState.listRows, popsState.receipts, popsState.answered).length,
    hasDetailsTemplate: popsVault.has('details'),
    hasPageTemplate: popsVault.has('page'),
    // Before any list has been read there is no cursor and no knowledge of
    // whether one exists; afterwards, a null cursor means the end.
    moreHistory: !popsState.seenAList || popsState.nextPageToken != null,
    running: popsState.running,
    progress: popsState.progress,
    error: popsState.error,
  }),
  loadHistory: () => popsRun('history', popsPaginate),
  fetchAll: () => popsRun('receipts', popsFetchReceipts),
  buildExport: () =>
    popsPure.exportFrom(popsState.listRows, popsState.receipts, new Date().toISOString()),
});
