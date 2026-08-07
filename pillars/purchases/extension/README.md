# Everyday Rewards receipt export

Woolworths offers no export. The receipts exist only inside the logged-in
Everyday Rewards web app, so this unpacked Chrome extension reads them from
the session you are already in and writes a JSON file the purchases pillar
ingests.

## Installing

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this directory
3. Open <https://www.everyday.com.au/index.html#/my-activity> and **reload**
   the page — the content script attaches at `document_start`, so a tab that
   was already open sees nothing.

## Using it

1. **Scroll your activity list** as far back as you want history to go. The
   extension records the list pages the app fetches as you scroll; it never
   asks for them itself.
2. **Open any one receipt.** That single request is the template for all the
   rest — until you do, the extension knows the receipt ids but not the
   request shape, and the fetch button stays disabled.
3. **Fetch remaining receipts.** One at a time, ~350 ms apart. Leave the tab
   open; closing the popup is fine, closing the tab is not.
4. **Download JSON.**

Ingest the file with:

```bash
pnpm --filter @pops/purchases ingest:woolworths ~/Downloads/everyday-receipts-2026-08-07.json
```

## Why it is built this way

The app talks to `POST https://apigee-prod.api-wr.com/wx/v1/bff/graphql` with
two operations that get opposite treatment:

| operation         | treatment         | why                                                                                                                                                                                                                 |
| ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activityHome`    | **observed only** | Its query declares only `$featureFlags` — the page's pagination cursor is not expressible in the query, so the request is not reproducible from the request alone. The page knows how to page; this script watches. |
| `ActivityDetails` | **replayed**      | Takes `{ id, featureFlags }`. The captured query text is reused verbatim with a substituted id, so no field list is hardcoded here and a schema change arrives in the export rather than breaking the capture.      |

The content script runs in the `MAIN` world because an isolated world gets
its own `fetch` and `XMLHttpRequest` and would observe nothing.

## What it does not do

- **It does not send anything anywhere.** The only egress is the file you
  save. There is no host permission for any POPS service, deliberately: an
  extension that could post to your own API is an extension that could post
  somewhere else if it were ever tampered with.
- **It does not write to Woolworths.** Every request it makes is a read the
  page itself makes when you open a receipt.
- **It does not touch payment card data.** The receipt payload carries EFTPOS
  terminal fields — AID, ARQC, TVR, terminal and merchant ids. Those are
  exported verbatim in the raw JSON, and the ingest side keeps only the card
  scheme and last four digits (see `src/ingest/woolworths/`). Treat the
  exported file as sensitive and delete it after ingesting.

## Failure modes worth knowing

- **`hasTemplate` never becomes true** — you opened a receipt before
  reloading the page with the extension installed. Reload, open a receipt.
- **A fetch stops part-way** — the message names how far it got. Receipts
  already captured are kept and exportable; pressing fetch again resumes
  rather than restarting.
- **Blank list after scrolling** — the site changed the shape of
  `activityHome.results.sections[].sectionItems[]`. `content.js` reads
  `activityDetailsId` there and nowhere else; that is the one field this
  extension does assume.
