# Everyday Rewards receipt export

Woolworths offers no export. The receipts exist only inside the logged-in
Everyday Rewards web app, so this unpacked Chrome extension reads them from
the session you are already in and writes a JSON file the purchases pillar
ingests.

Nothing in this directory may be named with a leading underscore — Chrome
reserves those and refuses to load the extension at all — which is why the
tests live in `tests/` rather than the repo's usual `__tests__/`.

## Installing

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this directory
3. Open <https://www.everyday.com.au/index.html#/my-activity> and **reload**
   the page — the content scripts attach at `document_start`, so a tab that
   was already open sees nothing.

## Using it

1. **Scroll the activity list once.** That single scroll makes the app issue
   its pagination request, which is the one thing the extension cannot
   synthesise from nothing.
2. **Open any one receipt.** Same reason, for the receipt request.
3. **Load full history** — walks the list to the end on its own, one page
   token at a time. No more scrolling.
4. **Fetch remaining receipts** — one request per listed row, ~1/second.
   A year of shopping is several hundred rows, so this takes minutes, not
   seconds; not every row has a receipt and the ones that do not are only
   asked about once.
5. **Download JSON.**

Leave the tab open while it works; closing the popup is fine, closing the
tab is not.

Ingest the file with:

```bash
pnpm --filter @pops/purchases ingest:woolworths ~/Downloads/everyday-receipts-2026-08-07.json
```

## The contract it depends on

Everything goes to `POST https://apigee-prod.api-wr.com/wx/v1/bff/graphql`,
over **XMLHttpRequest** rather than `fetch` — verified against the live
site. Both are patched anyway; assuming one and being wrong captures
nothing at all.

| operation                     | variables                     | payload                             | how it is used                                                                                    |
| ----------------------------- | ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `RewardsActivityHome`         | `$featureFlags`               | `data.activityHome.results`         | **Observed only.** It fires once at page load and takes no cursor, so there is nothing to replay. |
| `RewardsActivityHomeNextPage` | `$pageToken`, `$featureFlags` | `data.activityHomeNextPage.results` | **Replayed.** `results.nextPageToken` feeds the next call until it comes back null.               |
| `ActivityDetails`             | `$id`, `$featureFlags`        | `data.activityDetails.tabs[]`       | **Replayed** per receipt id, keeping the tab whose page is a `ReceiptDetails`.                    |

**A replay needs the app's headers, not just its cookies.** The endpoint
sits behind an API key and a bearer token that the app sets per request —
`client_id`, `api-version`, `Authorization`, `Accept`. Replaying with
`credentials: 'include'` alone answers `401 Api Key is empty`. They are
captured off the real request rather than named in code, because naming
them means guessing which ones matter and breaking the day one is renamed.
For an XHR the only place they are visible is `setRequestHeader`, which is
why that is patched too. They stay in page memory and never reach the
export.

The two list operations put their payload under different `data` keys, so
`pure.js` looks for whichever key carries a `results` object instead of
naming either. It deliberately does **not** require `results.sections` to be
an array: the last page of a history answers `{ sections: null,
nextPageToken: null }`, and treating that as unreadable ends the walk with
"the list stopped advancing" on the one response that means "that was
everything".

The receipt id comes from `sectionItems[].activityDetailsId`, and **having
one is the whole test for keeping a row.** Two narrower filters were tried
and both lost real purchases: requiring `receipt` dropped shops that had
one, and also requiring `transactionType === 'purchase'` left a list of 46
against a page showing several hundred rows. Both were inferred from rows
that had already passed the filter, which is circular — the rows that would
have disproved them were exactly the ones being discarded.

So nothing is predicted. Every row the API will answer questions about is
asked about, and whether it has a receipt is decided by the answer. A row
that turns out to have none costs one request whose result is discarded,
and is then remembered so it is never asked about again.

The content scripts run in the `MAIN` world because an isolated world gets
its own `fetch` and `XMLHttpRequest` and would observe nothing.

## What it does not do

- **It does not send anything anywhere.** The only egress is the file you
  save. There is no host permission for any POPS service, deliberately: an
  extension that could post to your own API is an extension that could post
  somewhere else if it were ever tampered with.
- **It does not write to Woolworths.** Every request it makes is one the
  page itself makes when you scroll or open a receipt.
- **It does not filter payment data.** The receipt payload carries the
  EFTPOS terminal block verbatim — merchant id, terminal id, AID, ARQC, TVR
  and the card's last four digits — and it is exported as-is, because the
  extension's job is to be a faithful copy. The ingest side keeps only the
  card scheme and last four (see `src/ingest/woolworths/`). Treat the
  exported file as sensitive and delete it once ingested.

## Testing

`pure.js` holds every decision the extension makes and nothing it does, so
it can be tested — `tests/pure.test.js` evaluates the shipped file the
way Chrome does rather than reshaping it for the test. Every bug found in
this extension so far lived in exactly those functions:

- reading the list by `data.activityHome` name, so the whole paginated
  history was ignored;
- replaying without the app's auth headers, which answers `401`;
- requiring `results.sections` to be an array, so the empty final page was
  unreadable and the walk ended with an error instead of finishing;
- requiring a `receipt` on a list row, which dropped a shop that had one.

`tests/capture.test.js` drives `observe.js` and `capture.js` end to end
against fakes, with `window`, `XMLHttpRequest` and `Request` supplied as
parameters so the shipped files run unedited. It covers the parts that only
exist because there is a browser: patching XHR, learning a template from an
observed request, and the two replay loops — including all three shapes the
end of a history has been seen to take, which is where the bugs that
survived into real use lived.

`popup.js` has no automated test; it is a remote control with no state of
its own, and is checked by using it.

## Failure modes worth knowing

- **A button stays disabled** — the popup says which of the two requests it
  is still missing. Scroll once, or open one receipt.
- **A run stops part-way** — the message says how far it got. What was
  captured is kept and exportable, and pressing the button again resumes
  rather than restarting.
- **"the site answered HTTP 401"** — the captured token has expired.
  Reload the page and start again; the capture is per-session by design.
- **"the list stopped advancing; its cursor repeated"** — the server handed
  back the same page token twice. Stopping beats looping until the account
  gets rate-limited. Reaching the end of your history is **not** this: that
  finishes quietly.
- **"stopped at the 200-page safety limit"** — the history is longer than
  the backstop allows in one run. Everything read is kept; press the button
  again to continue from there. It says so rather than stopping silently,
  because a silent stop is indistinguishable from having read it all.
- **Fewer receipts than you expected** — check how far back the site's own
  list goes by scrolling it. The extension can only reach what the API
  serves, and Everyday Rewards does not keep activity indefinitely.
- **Blank list after scrolling** — the site changed the shape of
  `results.sections[].sectionItems[]`. `activityDetailsId` there is the one
  field this extension truly assumes.
