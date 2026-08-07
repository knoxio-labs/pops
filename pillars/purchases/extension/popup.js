/**
 * The popup is a remote control, not a participant.
 *
 * All the state lives in the MAIN-world content script, because that is
 * where the page's own XHR was patched and where the captured receipts
 * accumulate. A popup is destroyed every time it closes, so keeping
 * anything here would lose a half-finished capture the moment the user
 * clicked away — which is why the buttons start work and then poll for it
 * rather than awaiting it.
 */

const el = {
  listed: document.getElementById('listed'),
  captured: document.getElementById('captured'),
  pending: document.getElementById('pending'),
  history: document.getElementById('history'),
  fetch: document.getElementById('fetch'),
  download: document.getElementById('download'),
  message: document.getElementById('message'),
};

async function inPage(func) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func,
  });
  return result?.result ?? null;
}

function say(text, isError = false) {
  el.message.textContent = text;
  el.message.className = isError ? 'error' : '';
}

function guidance(status) {
  if (status.error) return [status.error, true];
  if (status.running === 'history') {
    return [`Loading history — ${String(status.progress.done)} receipts listed so far…`];
  }
  if (status.running === 'receipts') {
    return [`Fetching ${String(status.progress.done)} of ${String(status.progress.total)}…`];
  }
  if (!status.hasPageTemplate) {
    return ['Scroll the activity list once — that is where the pagination request comes from.'];
  }
  if (!status.hasDetailsTemplate) {
    return [
      'Open any one receipt — that teaches the extension the request it replays for the rest.',
    ];
  }
  if (status.moreHistory) return ['Load your full history first, then fetch the receipts.'];
  if (status.pending > 0) return ['Ready. Fetching takes about a second per receipt.'];
  return ['Every listed receipt has been captured.'];
}

function render(status) {
  if (status === null) {
    for (const button of [el.history, el.fetch, el.download]) button.disabled = true;
    say('Open everyday.com.au and reload the page, so the extension is running on it.', true);
    return;
  }

  el.listed.textContent = String(status.listed);
  el.captured.textContent = String(status.captured);
  el.pending.textContent = String(status.pending);

  const idle = status.running === null;
  el.history.disabled = !(idle && status.hasPageTemplate && status.moreHistory);
  el.fetch.disabled = !(idle && status.hasDetailsTemplate && status.pending > 0);
  el.download.disabled = !(idle && status.captured > 0);

  const [text, isError = false] = guidance(status);
  say(text, isError);
}

async function refresh() {
  render(await inPage(() => window.__popsEveryday?.status() ?? null));
}

el.history.addEventListener('click', async () => {
  // Deliberately not awaited in the page: the walk outlives this popup, and
  // the user should be free to close it and come back.
  await inPage(() => {
    void window.__popsEveryday?.loadHistory();
  });
  await refresh();
});

el.fetch.addEventListener('click', async () => {
  await inPage(() => {
    void window.__popsEveryday?.fetchAll();
  });
  await refresh();
});

el.download.addEventListener('click', async () => {
  const payload = await inPage(() => window.__popsEveryday?.buildExport() ?? null);
  if (payload === null) {
    say('Nothing captured yet.', true);
    return;
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  );
  await chrome.downloads.download({
    url,
    filename: `everyday-receipts-${payload.capturedAt.slice(0, 10)}.json`,
    saveAs: true,
  });
  say(`Exported ${String(payload.receipts.length)} receipts.`);
});

setInterval(() => void refresh(), 700);
void refresh();
