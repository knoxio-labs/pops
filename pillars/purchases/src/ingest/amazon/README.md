# Amazon DSAR export adapter

Parses `Your Amazon Orders/Order History.csv` and `Your Returns & Refunds/Refund Details.csv` from the Amazon "Request My Data" bundle into orders for `POST /purchases`. Ingest only — nothing here links, matches or sweeps.

The self-serve Order History Report was retired in most regions; the DSAR bundle is the surviving path, and its layout differs by region and has changed over time. This parser was written against a real 943-row Australian bundle, and the numbers quoted below are measurements from it rather than estimates.

## The grain, which is the whole problem

The CSV is **one row per shipment-item**, and its columns are a mix of three grains. Reading them all at row level does not throw — it silently inflates every multi-item order.

| grain    | key                       | columns that are authoritative at it                            |
| -------- | ------------------------- | --------------------------------------------------------------- |
| order    | `Order ID` — 748 of them  | Σ per-line `Total Amount`, Σ per-line `Total Discounts`         |
| shipment | `Ship Date` — 773 of them | `Shipment Item Subtotal`, `… Tax`, `Shipping Charge`, once each |
| line     | the row — 943 of them     | `Unit Price`, `Unit Price Tax`, `Original Quantity`             |

Two measurements pin this down:

- `Shipment Item Subtotal` is **identical across every row of a multi-item shipment, on 91 of 91** such shipments. Summing it per row multiplies it by the line count.
- `Σ (Unit Price × Original Quantity)` reconstructs `Shipment Item Subtotal` **exactly, on 747 of 747** shipments. Zero drift, so the line economics are trustworthy even where the order-level components are not.

`Total Amount` is the opposite: it varies per line on 99 of 103 multi-row orders, because it is the line's allocated share including tax and postage. That is why the order total is a sum over rows while the subtotal is not.

Shipments group by `Ship Date`. Tracking number gives the same grouping — 23 orders have more than one of each and **none disagree** — but ship date survives the 30 rows that carry no tracking at all.

## Why the component identity is advisory

`subtotal + tax + shipping + discounts == Σ line totals` holds on **735 of 747** shipments. The twelve misses are between one and four dollars and cluster on older orders.

They are ingested and flagged, never rejected. The order did happen; the merchant's arithmetic is what it is, and a CHECK on the identity would refuse valid orders at the boundary (ADR-042). The check is skipped entirely where the source states no components at all — a cancelled shipment reads `Not Available`, and treating that as zero would manufacture a mismatch against a figure Amazon never claimed.

## Traps this parser exists to survive

Every one of these is present in the reference bundle and every one is silent if unhandled.

- **No cell is ever empty.** Absence is the literal text `Not Available` or `Not Applicable`, so an empty-string check finds nothing and parses the sentinel as a product name.
- **Discounts are wrapped in literal apostrophes** — `'-1.6'` — on 157 of 943 rows. Excel's force-to-text convention, surviving into the CSV as part of the value. `Number("'-1.6'")` is `NaN`, so every discounted order would lose its discount without erroring.
- **One row states `'1,495'`**: apostrophes _and_ a thousands separator, inside ordinary CSV double-quoting. Rejecting it dropped that line and its money out of the order silently, because the order still totalled correctly from `Total Amount`. Commas are stripped only from the strictly digit-grouped form, since `1,49` in a decimal-comma locale means one-forty-nine and reading it as 149 is a hundredfold error.
- **Amazon concatenates values.** Two rows carry a `Ship Date` holding two timestamps joined by `" and "`, with a matching `Shipment Status` of `"Shipped and Shipped"`. The first value is taken and the order is flagged.
- **Quantity 0 is real** on 27 rows — cancelled lines, which the contract's minimum of 1 cannot express. They are ingested at quantity 1 and flagged rather than dropped, because three cancelled rows in the bundle carry a non-zero total and "cancelled ⇒ ignore" would lose real money from the reconciliation.
- **Gift messages contain newlines** inside quoted fields on 7 rows, which is why this goes through a CSV parser rather than splitting on `\n`.

## Anomalies

Parsing never aborts. A 943-row backfill that dies on row 700 is worse than one that lands every order it can and names what it could not take. Every compromise is reported as an `AmazonAnomaly` carrying the order it happened on.

`dropped-line` and `dropped-order` are the ones that matter most, because they are the cases where data does not arrive at all. A line that cannot be read is money leaving the order invisibly — the order still totals correctly from `Total Amount`, so nothing downstream can tell a line is missing. A test asserts lines-out plus dropped equals rows-in.

An order is dropped only when its `Order Date` or `Currency` is unreadable. Skipping is correct there — `orderedAt` is what the reconciliation window is measured against, so an order without one could never match a transaction — but it is reported, because a backfill that quietly lands 700 of 748 orders is indistinguishable from one that landed everything.

## Refunds

`Refund Details.csv` is the one returns file that states money. Sixteen rows, sixteen distinct orders, all sixteen joining to `Order History.csv`, one refund each. Each becomes a single charge with `role='refund'`, a negative `amountCents`, and `chargedAt` set to `Refund Date` — the disbursement instant, which is the only date a bank transaction could ever settle against. `Creation Date` is when Amazon wrote the record, minutes to hours later on every row, and is not a substitute.

**Order-level only.** The feed names an order and never a line, so `purchase_items.refundedCents` is left alone and no charge carries allocations. Spreading an order-level refund across lines pro rata would be a guess presented as a measurement; a refund that is visibly attributed to the order beats one that is invisibly attributed to the wrong line.

The measurements behind reading one file and not five:

| file                        | rows | what it adds                                                                                                        |
| --------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------- |
| `Refund Details.csv`        | 16   | the disbursements. All 16 join                                                                                      |
| `Returns Status.csv`        | 21   | **no money.** 12 of its orders overlap `Refund Details` and agree exactly on all 12; the 8 it adds read `No Refund` |
| `Replacement Orders.csv`    | 22   | 3 of its replacement ids appear in `Order History`, all with a `$0` total                                           |
| `Your Orders.Returns.3.csv` | 3    | an `Order Item ID` in `miq://document…` form. `Order History.csv` has no such column, so it joins to nothing        |
| `Return Requests.csv`       | 1    | one ASIN — per-line attribution for 1 refund of 16                                                                  |

A replacement order is a second order for goods already paid for, so counting one as fresh spend would double-count the purchase. That does not happen on this bundle: of the 22 replacements, only three appear in `Order History` at all and all three carry a `$0` total — they are exactly the three `Return Resolution: Exchange` rows. There is no guard against a replacement that does carry money (POPS-1466), because no such row exists to write one against.

**A refund can never raise the residual.** `computeAccounting` keeps refunds out of the `matched`/`awaitingImport`/`residual` identity entirely (ADR-042), so a refunded order still reports its full total as residual until a capture is matched. That reads oddly on a fresh backfill and is the point: the alternative, folding refunds into the residual, made receiving a refund push the "something is wrong" number up.

Two rows are refused rather than recorded:

- **Reversal not `Completed`.** All 16 reference rows are `Completed`, so gating changes nothing there. It is gated because the errors are asymmetric — the order parser ingests a cancelled line because dropping it would lose money really spent, whereas recording an incomplete reversal would _invent_ money coming back.
- **A currency the order is not in.** `orderAmountCents` is the unit the residual is computed in and the bundle carries no rate, so a mismatch is reported instead of converted.

Both are anomalies, never silent: an unrecorded refund leaves the order reporting its full total as spent, which is indistinguishable from an order that was never refunded.

## Tax invoices

The bundle ships 325 PDFs under `Additional Data/`, and ADR-042 calls a tax invoice the arbiter whenever the CSV's own arithmetic is ambiguous. Twelve shipments here are exactly that — the component identity misses by one to four dollars — and the bundle carries an invoice naming eight of those twelve orders.

**Reading one is a parse, not an inference.** Every invoice in the bundle carries a real text layer: the order number is a string literal in a Flate-compressed content stream. So `invoice-pdf.ts` is fifty lines of `node:zlib` rather than a model call per file, and the answer for a given PDF is the same every time it is asked. There is no PDF library in the fleet and this did not add one.

Three things about the bundle make the walk non-obvious, and all three are silent if unhandled.

- **The filenames identify nothing.** They are `Retail.TransactionalInvoicing.<n>.pdf`, where `<n>` is a position in a batch.
- **The invoices arrive in sibling directories and the numbering restarts in each.** In the reference bundle they are `.1` (1 file), `.3.1` (251) and `.3.2` (73), and `.3.1/…1.pdf` and `.3.2/…1.pdf` are different invoices for different orders. Every key is a path, never a filename.
- **The template renamed the same field twice.** `Order Number:`, `Order no.` and `Order #` are all live in one download, so reading only the current spelling leaves the older invoices unattached.

With all three handled, **325 of 325 yield exactly one labelled order number** and none names two.

## What the invoices match, and what they do not

Matching is an exact membership test against the orders this parser built. An order id is a fixed seventeen-character shape, so a misread lands on nothing rather than on a different real order, and nothing is matched on a resemblance.

| outcome              | PDFs | why                                                                |
| -------------------- | ---- | ------------------------------------------------------------------ |
| matched              | 263  | naming 250 orders. 11 orders are named by more than one, at most 4 |
| `digital-order`      | 56   | a `D01-` id, which `Order History.csv` does not carry at all       |
| `duplicate-document` | 6    | a second rendering of a document already matched to that order     |

Nothing else. There is no `unknown-order`, no `no-order-id` and no `ambiguous-order-id` in this bundle — every non-digital id resolved.

The 56 digital ones are a known gap rather than a misread: their `D01-` ids appear in `Digital Content Orders.csv`, which `../amazon-digital/` reads under its own source, and **none** appears in `Order History.csv`. They get their own rejection kind for that reason — a retail id that fails to resolve means an order was dropped, which is a bug, and burying it among 56 expected misses would hide it. Their orders do exist now, under the digital source; nothing attaches these invoices to them (POPS-2373).

The 6 duplicates are the one case content addressing cannot handle. Two files carrying the same invoice number for the same order have _different bytes_, so they hash to different paths and `uq_purchase_documents` sees two distinct URIs. The second is dropped here, or the order would show one invoice twice. Two invoices with genuinely different numbers on one order are kept — 11 orders have those.

**Matched is not attached.** A matched invoice travels in the create request for the order it names, and reaches the database only if that request creates the order. There is no route that attaches a document to an order that already exists, so a run against a database this bundle has already been ingested into attaches nothing at all and says so (POPS-2311).

A credit note (`Tax Adjustment Note`, 10 in the bundle) is filed as `other`, not `tax_invoice`: it unwinds an invoice rather than being one, and `DOCUMENT_KINDS` has no entry for it.

**Order grain, not shipment.** The documents state no shipment identifier this parser could join on, so `purchase_documents.shipment_id` is left null.

## Where the invoice bytes land

In this pillar's own content-addressed store, under `pops://purchases/receipt/<sha256>` — the same store the receipt drop-zone writes to. ADR-042 wants purchase evidence under `pops://documents/...`, but the `documents` pillar is a read-only bridge over Paperless-ngx with no write route at all, and holding 325 invoices until one exists is the wrong order. POPS-1528 migrates every stored file at once; these travel with the rest, and nothing here has to be undone for that to happen.

**The store is a local directory** — beside this pillar's SQLite file, or `PURCHASES_RECEIPT_DIR`. Running the CLI against a remote `PURCHASES_BASE_URL` from a machine that cannot see the server's volume writes the URIs into the database and the bytes onto the wrong host. Run it where the volume is mounted.

The bytes go down **before** the request that names them, because a row pointing at a file that is not there cannot be repaired: `POST /purchases` is create-only, so a re-run is a 409 and the reference stays broken. What that ordering writes for an order the server then refuses is removed again at the end of the run, so a run that creates nothing leaves nothing behind.

## What this adapter does not produce

**No captures.** The export publishes no per-charge breakdown of what was _paid_, so every order lands at `awaiting_settlement` with its full total as residual until the reconciliation engine mints a derived charge for the transaction it matches. A first backfill therefore reads as 748 orders, 100% unexplained. That is correct, not broken. Refunds are the sole exception, and they do not reduce the residual.

**No documents** (POPS-1304). The bundle ships 325 tax-invoice PDFs, but their filenames carry no order id — mapping one to an order needs text extraction from the PDF.

**No digital orders.** `Digital Content Orders.csv` is a separate Order ID namespace with zero overlap against the 748 physical orders, and `../amazon-digital/` reads it under its own source. `Digital Returns.csv` belongs with it, not here.

## Running it

```bash
cd pillars/purchases && pnpm ingest:amazon -- "<bundle-root>" --dry-run
```

`<bundle-root>` is the unzipped bundle's top directory — the one that _contains_ `Your Amazon Orders/`, not that folder itself. Amazon names it `Your Orders`, so the path usually ends in it:

```bash
POPS_INTERNAL_API_KEY=<key> pnpm ingest:amazon -- ~/Downloads/"Your Orders"
```

A real run writes through `POST /purchases`, which is behind the inbound service-account gate, so it needs a key whose account grants `purchases.source` and `purchases.purchase`; the run aborts before its first request without one. The `--dry-run` above needs no key — it parses and reports, and never calls the pillar.

`Your Returns & Refunds/Refund Details.csv` is read from the same root. A bundle from an account that never returned anything does not carry it, and its absence is reported and tolerated; a file that exists and cannot be read is not, because proceeding would land every refunded order at its full total.

Re-running is safe: each order carries a content checksum covering its rows _and_ its refunds, and `(source, sourceOrderId)` is unique, so a second run reports every order as a skip. Neither guard _updates_ an order whose bundle has since gained a shipment or a refund — a re-download that extends an existing order is skipped, not merged. This is why refunds are attached at creation rather than in a second pass: `POST /purchases` is the only write path, and an order is written once with everything the bundle says about it.
