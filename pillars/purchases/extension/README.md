# Everyday Rewards receipt export

Woolworths offers no export. The receipts exist only inside the logged-in
Everyday Rewards web app, so this unpacked Chrome extension reads them from
the session you are already in and writes a JSON file the purchases pillar
ingests.

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
4. **Fetch remaining receipts** — one request per receipt, ~1/second.
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
`observe.js` looks for whichever key carries a `results.sections` instead of
naming either. The receipt id comes from `sectionItems[].activityDetailsId`,
and rows without a `receipt` are skipped — those are points adjustments, not
shops.

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
  gets rate-limited.
- **Blank list after scrolling** — the site changed the shape of
  `results.sections[].sectionItems[]`. `activityDetailsId` there is the one
  field this extension truly assumes.
