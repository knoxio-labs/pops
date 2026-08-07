/**
 * The popup is a remote control, not a participant.
 *
 * All the state lives in the MAIN-world content script, because that is
 * where the page's own `fetch` was patched and where the captured receipts
 * accumulate. A popup is destroyed every time it closes, so keeping
 * anything here would lose a half-finished capture the moment the user
 * clicked away.
 */

const el = {
  listed: document.getElementById('listed'),
  captured: document.getElementById('captured'),
  pending: document.getElementById('pending'),
  fetch: document.getElementById('fetch'),
  download: document.getElementById('download'),
  message: document.getElementById('message'),
};

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function inPage(func, args = []) {
  const tab = await activeTab();
  if (!tab?.id) return null;
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func,
    args,
  });
  return result?.result ?? null;
}

function say(text, isError = false) {
  el.message.textContent = text;
  el.message.className = isError ? 'error' : '';
}

function render(status) {
  if (status === null) {
    el.fetch.disabled = true;
    el.download.disabled = true;
    say('Open everyday.com.au and reload the page, so the extension is running on it.', true);
    return;
  }

  el.listed.textContent = String(status.listed);
  el.captured.textContent = String(status.captured);
  el.pending.textContent = String(status.pending);

  el.fetch.disabled = !(status.hasTemplate && status.pending > 0 && !status.running);
  el.download.disabled = !(status.captured > 0 && !status.running);

  if (status.error) {
    say(status.error, true);
    return;
  }
  if (status.running) {
    say(`Fetching ${String(status.progress.done)} of ${String(status.progress.total)}…`);
    return;
  }
  if (!status.hasTemplate) {
    say(
      'Open any one receipt on the page first — that teaches the extension the request it replays for the rest.'
    );
    return;
  }
  if (status.listed === 0) {
    say('Scroll your activity list; every page you load is recorded here.');
    return;
  }
  say(
    status.pending === 0
      ? 'Everything listed has been captured. Scroll further back for more history.'
      : 'Scroll further back before fetching if you want more history.'
  );
}

async function refresh() {
  render(await inPage(() => window.__popsEveryday?.status() ?? null));
}

el.fetch.addEventListener('click', async () => {
  // Deliberately not awaited in the page: the capture outlives this popup,
  // and the user should be free to close it and come back.
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
  const stamp = payload.capturedAt.slice(0, 10);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  );
  await chrome.downloads.download({
    url,
    filename: `everyday-receipts-${stamp}.json`,
    saveAs: true,
  });
  say(`Exported ${String(payload.receipts.length)} receipts.`);
});

setInterval(() => void refresh(), 700);
void refresh();
