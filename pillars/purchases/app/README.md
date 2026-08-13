# @pops/app-purchases

The frontend module for the purchases pillar. It registers `/purchases` with
`pillars/shell` and puts the pillar on the app rail.

Frontend-only: this package owns no database. Everything goes over the
purchases pillar's REST contract through the generated
`@hey-api/client-fetch` client in `src/purchases-api/`, served at the shell's
`/purchases-api` proxy path (see `src/purchases-api-runtime-config.ts`).

## The reconcile queue

`/purchases` is the reconciliation inbox: one row per purchase charge awaiting
a decision, with the charge on the left, what the engine proposes on the right,
and `Σ proposed − charge` between them.

**The axes are the shipped endpoint's, not the ticket's.** `GET /reconcile/queue`
returns one entry per charge carrying 0..n proposed transactions, so the charge
is the stable side and the transactions are the plural one. Laying it out the
other way would make every row a different height for no gain.

**It is keyboard-driven, and that is the feature.** The queue arrives focused,
so `j`/`k` move the cursor, `enter` accepts and `x` rejects without a click
first. Arrow keys do what `j`/`k` do, because the queue is one `role="listbox"`
and a listbox is expected to answer them. Nothing inside a row is focusable:
interactive children inside a `role="option"` would take focus off the list and
break the bindings after the first click, so the accept/reject buttons live in
a bar above the list and act on the row under the cursor.

**A decision covers every proposal on the charge.** The solver emits several
links for one charge when the charge was settled by a split across
transactions, so those links are one answer rather than competing ones.
Confirming one and leaving the rest would pin half a partition.

### What accepting and rejecting actually persist

This is narrower than POPS-241 describes, and the page says so in its own copy
rather than implying otherwise.

| the view calls it | it calls                  | which does                                                 |
| ----------------- | ------------------------- | ---------------------------------------------------------- |
| Accept            | `POST /reconcile/confirm` | sets `confirmedAt`, pinning the link against re-derivation |
| Reject            | `POST /reconcile/unlink`  | deletes the link, and remembers nothing                    |

**No `purchase_match_rule` is written.** Nothing in the pillar writes that
table — the ticket's "accepting writes a rule, rejecting feeds it negatively"
is unbuilt on the server, not skipped here, and inventing a client-side stand-in
would put a second rule model in front of the one POPS-1309 has to read. That
half is POPS-1898, which blocks POPS-1309.

**There is no reject endpoint**, by an explicit decision in
`src/contract/rest-reconcile.ts`: a reject the next sweep silently re-derives is
worse than no reject. `unlink` is honest about being temporary, so a rejected
charge comes back as unexplained rather than leaving the queue — which is why
the cursor is keyed by charge id and parks on the successor before the refetch
lands, instead of counting indexes.

An unexplained charge (no proposals) has nothing to confirm or delete, so both
keys refuse rather than firing a request that would 404. Nothing can link it by
hand yet either — POPS-1900.

### Paging

Reads take the server's 50-row default and the view says when the page came
back full. No offset cursor: confirming drains the queue from underneath the
cursor, so an offset over a shrinking list is the wrong shape.

## The merchant lens

The roll-up layer only.

`/purchases/merchants` reads `GET /analytics/merchant-spend` and renders one
section per currency, one row per merchant. Three things about it are load
bearing rather than stylistic:

- **The unexplained bucket is always on screen**, including when it is zero.
  Hiding it when there is nothing to report would make its absence mean two
  things at once — "all accounted for" and "this view does not show that" —
  and a reader cannot tell those apart. `residualCents` comes verbatim from
  the server and the explained figure is its complement, never the reverse.
- **The percentage never reads 100% while a residual exists.** A one-cent
  residual against a five-figure total rounds to 100, which is the exact
  false certainty
  [ADR-042](../../../docs/architecture/adr-042-purchase-documents-and-transaction-reconciliation.md)
  refuses one layer down. The share clamps to 99, and is withheld entirely
  when the figures are not a part-of-whole (a negative total, or more linked
  than was ever spent).
- **Merchant attribution is reported, not assumed.** The roll-up groups on a
  resolved entity, on a bare label, or not at all, and the legend on the page
  says what each costs. A label total presented as an entity total is the
  same class of error as a dropped residual, one dimension over.

The tag treemap, the per-item history and the inventory cross-reference the
merchant lens is specified to drill into have no routes behind them. The page
names them as absent rather than rendering an empty panel, which would read
as a statement about the data instead of about the software.

## The receipt drop zone

`/purchases/receipts` is the way in. It posts `POST /receipts` — the pillar's
one intake for merchants that never get a dedicated adapter — and takes all
three shapes that endpoint accepts: a photographed till slip, a PDF tax
invoice, or a pasted order confirmation. Files become base64 parts with no
`data:` prefix, and a pasted body is base64 of its UTF-8 bytes, because the
contract stores every shape one way.

**One receipt can be several parts, and their order is the receipt's.** A long
supermarket slip does not fit in one frame, so up to eight parts are staged
into one upload and one purchase. The staged list is reorderable for that
reason: the server reads the parts top to bottom, and shuffled frames are a
different document. Overflow past the eighth part is reported rather than
trimmed in silence.

**The three outcomes stay three.** `POST /receipts` answers with a
discriminated union and the page keeps the distinction:

| outcome        | what it means                                         | what the page does                                                               |
| -------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `created`      | read, and the arithmetic agreed with the stated total | reports the purchase, and says when the bytes were already in the store          |
| `needs-review` | read, and it did not add up — **nothing was written** | lists the gate's objections with the delta each carries, and renders the reading |
| `unreadable`   | nothing usable came back                              | says so, with the reason, and where the upload was stored                        |

`needs-review` is deliberately not dressed as a success. Its whole purpose is
a human comparing the model's reading against the paper, so the extracted
figures are rendered verbatim — unformatted, because a total tidied into
`$41.20` is no longer evidence of what was read — and the delta is shown in
the receipt's own currency, or in bare cents when the receipt named none.

**A 409 is "already recorded", not an error.** The pillar refuses a re-upload
from three places, and the page treats all three the same. Two run before the
model is called — content hash, and the same shop at the same instant and
amount — and carry `code: 'ALREADY_IMPORTED'`. The third is the write itself
rejecting a checksum it already holds, which carries `code:
'DUPLICATE_PURCHASE'`; a second upload reaches it only when the first had not
committed yet, so it is the concurrent case rather than the re-upload-later
one. The page reads the code rather than the HTTP status and renders any of
them as an ordinary outcome. The 409 body carries no purchase, only its id
inside the message, which is shown as sent.

**The created panel opens the order it recorded.** The reader's next question
after "it was read" is always "read as what", and that is the order page.

## One order

`/purchases/:purchaseId` renders `GET /purchases/{id}` whole: the order's
identity, its accounting split, its lines with their tags, units and notes,
its charges with their allocations and links, its deliveries, its documents
and its tags. It is the destination the rest of this app was missing — the
queue, the drop zone and a global-search hit each produce a purchase id, and
each was a dead end while nothing rendered one.

**It carries no rail entry.** Every other route in this app is somewhere a
reader can go from nothing; an order is only reachable from something that
already holds its id, so a nav item pointing here could not be built.

**A line-item search hit lands here at `?item=<id>`.** A line has no page of
its own — the pillar reads one only through its order — so the order is the
page a line has, and the query names which line was asked for. The line is
marked rather than the page being filtered to it: the reader asked about a
line and is being shown the order, and hiding the rest would answer a question
they did not ask. A line the order no longer carries marks nothing and costs
nothing.

**A missing order is not a failure.** `404` renders as "no such order", with
no retry button, because the request worked and the answer was that the order
is gone. Only the other failures get a retry.

**Nothing on this page follows a cross-pillar URI.** A linked transaction, an
inventory unit and a document are rendered as the `pops://` references they
are. This app resolves nothing across that seam, and a link that 404s reads as
a broken page rather than as a reference to something living elsewhere.

## Layout

```
src/
  index.ts                         entrypoint — re-exports manifest, navConfig, routes
  manifest.ts                      ModuleManifest (id='purchases')
  routes.tsx                       route table + navConfig
  money.ts                         cents → currency string, degrading on an unknown code
  facts.tsx                        one labelled value, saying what its absence means
  purchases-api/                   generated Hey API client (do not hand-edit)
  purchases-api-helpers.ts         unwrap() for the generated {data,error} results
  purchases-api-runtime-config.ts  client baseUrl ('/purchases-api')
  pages/
    ReconcileQueuePage.tsx         /purchases — the reconciliation queue
    reconcile/
      types.ts                     view types aliased off the generated client
      money.ts                     the delta's three states
      useReconcileQueue.ts         GET /reconcile/queue
      useReconcileDecisions.ts     confirm/unlink, and what they persist
      useQueueCursor.ts            where the keyboard points
      QueueList.tsx                the listbox and its key bindings
      QueueEntryRow.tsx            one row: charge · delta · proposals
      QueueFilters.tsx             kind + includeAuto
      DecisionBar.tsx              accept/reject, the shortcut hint, the caveat
    MerchantLensPage.tsx           /purchases/merchants — spend per merchant
    merchant-lens/
      types.ts                     view types aliased off the generated client
      period.ts                    the period vocabulary and the window it sends
      explained-split.ts           explained/unexplained, and when a share is meaningful
      useMerchantLensModel.ts      GET /analytics/merchant-spend, folded per currency
      CurrencyGroupSection.tsx     one currency, its total, its merchants
      MerchantRow.tsx              one merchant: headline, split, figures
      ExplainedSplit.tsx           the split and its meter
      PeriodPicker.tsx             all time, or a year
      AttributionLegend.tsx        what each grouping badge means and costs
      AbsentDrillDown.tsx          the layers with no route behind them
    PurchaseDetailPage.tsx         /purchases/:purchaseId — one order, whole
    purchase-detail/
      types.ts                     view types aliased off the generated client
      usePurchaseDetail.ts         GET /purchases/{id}, and the 404 that is not a failure
      OrderIdentity.tsx            who, when, how it arrived, how it settles
      AccountingSplit.tsx          total · matched · awaiting · unexplained · refunded · net
      LineList.tsx                 the lines, their tags, units and notes
      ChargeList.tsx               charges, their allocations and their transaction links
      DeliveryList.tsx             deliveries, and the documents behind the order
    ReceiptDropZonePage.tsx        /purchases/receipts — hand a receipt over
    receipts/
      types.ts                     view types aliased off the generated client
      parts.ts                     accepted media types, and the staged-part list operations
      encode.ts                    bytes and pasted text → bare base64
      staging.ts                   folding a batch of files into one receipt, bound and all
      useReceiptStaging.ts         the staged parts and what changes them
      useReceiptUpload.ts          POST /receipts, and the 409 that is not a failure
      ReceiptIntake.tsx            drop zone, paste box, staged parts, send
      StagedPartList.tsx           the parts in the order they will be read
      PastedTextForm.tsx           an order confirmation, pasted
      StagingProblems.tsx          what did not become a part, and why
      OutcomePanel.tsx             one panel per outcome, kept apart
      OutcomeParts.tsx             the panel frame, a labelled reading, the stored uris
      ExtractedReading.tsx         what the model read, verbatim
```

The generated client under `src/purchases-api/` is produced from
`pillars/purchases/openapi/purchases.openapi.json` and must not be edited by
hand. Regenerate it with `generate:purchases-client` after the contract
changes; CI diffs the committed output against a fresh run.

## Run

```sh
pnpm --filter @pops/app-purchases typecheck                 # tsc --noEmit
pnpm --filter @pops/app-purchases test                      # vitest run
pnpm --filter @pops/app-purchases test:watch                # vitest (watch)
pnpm --filter @pops/app-purchases test:coverage             # vitest run --coverage
pnpm --filter @pops/app-purchases generate:purchases-client # regen src/purchases-api
```

## Install gate

`@pops/app-purchases` exposes a single `.` export — `manifest`, `navConfig`,
and `routes`, all browser-safe. `pillars/shell` imports the `manifest` and
gates mounting on its `POPS_APPS` selection: adding `purchases` mounts the
module at `/purchases`, removing it hides those routes. No data lives in this
package, so uninstalling only removes the UI — purchase data stays in the
purchases pillar.

## Docs

- Pillar overview: [`pillars/purchases/README.md`](../README.md)
