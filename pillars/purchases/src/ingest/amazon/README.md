# Amazon DSAR export adapter

Parses `Your Amazon Orders/Order History.csv` from the Amazon "Request My Data" bundle into orders for `POST /purchases`. Ingest only — nothing here links, matches or sweeps.

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

## What this adapter does not produce

**No charges.** The export publishes no per-charge breakdown, so every order lands at `awaiting_settlement` with its full total as residual until the reconciliation engine mints a derived charge for the transaction it matches. A first backfill therefore reads as 748 orders, 100% unexplained. That is correct, not broken.

**No documents.** The bundle ships 325 tax-invoice PDFs, but their filenames carry no order id — mapping one to an order needs text extraction from the PDF.

**No digital orders.** `Digital Content Orders.csv` is a separate Order ID namespace with zero overlap against the 748 physical orders, so it needs its own path rather than a widened parser.

**No refunds.** Five returns/refunds CSVs join on `Order ID` and would net against line items.

## Running it

```bash
cd pillars/purchases && pnpm ingest:amazon -- "<bundle-root>" --dry-run
```

`<bundle-root>` is the unzipped bundle's top directory — the one that _contains_ `Your Amazon Orders/`, not that folder itself. Amazon names it `Your Orders`, so the path usually ends in it:

```bash
pnpm ingest:amazon -- ~/Downloads/"Your Orders"
```

Re-running is safe: each order carries a content checksum, and `(source, sourceOrderId)` is unique, so a second run reports every order as a skip. Neither guard _updates_ an order whose bundle has since gained a shipment — a re-download that extends an existing order is skipped, not merged.
