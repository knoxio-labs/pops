# Everyday Rewards adapter

Turns the JSON the `extension/` Chrome extension exports into
`CreatePurchaseInput`s. Woolworths publishes no export, so the extension is
the only source; this directory is what makes its output trustworthy.

```
extension/  →  export.json  →  parseWoolworthsExport()  →  POST /purchases
```

Run it with `pnpm --filter @pops/purchases ingest:woolworths -- <file>`.
Add `--dry-run` to parse and report without writing.

## Why this needs a tested module

The receipt is a till slip, and a till slip is prose. Every hard part here
is a thing that reads plausibly wrong.

**An item row has no quantity, no unit price and no SKU** — only
`{ prefixChar, description, amount }`. A product bought twice spans three
rows, with the money on a _later_ row than the name:

```
Thomas Dux Smoked Salmon Slices 300g
Qty 2 @ $9.24 each                    18.48
PRICE REDUCED BY $7.26 each
```

Read one row as one product and you get a product called `Qty 2 @ $9.24
each` costing $18.48, another called `PRICE REDUCED BY $7.26 each` costing
nothing — **and the total still reconciles exactly.** No arithmetic check
catches this, which is why `rows.ts` has its own tests asserting the
grouping rather than the sum. See the header comment there.

**The time is a local wall clock with no zone.** `20:39 24/07/2026` read as
UTC misplaces every purchase by ten or eleven hours, moving an evening shop
into the next day and a month-end one into the next month. `time.ts` derives
the offset per timestamp, because Sydney is +10:00 for part of the year and
+11:00 for the rest.

**The date is day-first.** `07/08/2026` is 7 August, not 8 July. Both
readings parse and both look plausible.

## Decisions worth knowing

**The key is the till transaction, not the API id.**
`store-POS-transaction-date`, e.g. `1034-066-3184-24072026`. The
`activityDetailsId` is an opaque blob whose stability across exports nothing
guarantees; the till transaction is printed on the paper. It is kept in
`rawRef` so a receipt can still be traced back.

**GST is not carried into `taxCents`.** Australian shelf prices include it,
so the line totals already contain the GST the receipt states separately.
Putting that figure in `taxCents` would make it appear twice in any sum of
components. It is not lost — `#` marks each GST-applicable line, and that is
carried through as `merchantCategory: 'gst-applicable'`.

**Only the card scheme and last four survive.** `payments[].details[]` is
the raw EFTPOS slip: merchant id, terminal id, AID, ARQC, TVR. None of it
helps match a transaction — reconciliation runs on amount and date — so the
cheapest way to never leak it is to never store it (`payment.ts`).

**Woolworths auto-links.** A till receipt settles as one card charge for the
stated total on the day it happened, so there is nothing for a human to
decide, and grocery is thousands of lines a year. The source is registered
with `autoLinkPolicy: 'auto'` (ADR-042).

## What it refuses, and what it merely flags

Refused outright — these produce a `dropped-receipt` anomaly and no
purchase, because the row would be unmatchable and indistinguishable from
one that simply has not settled yet:

- no readable transaction line (so no date)
- no stated total
- no items block

Ingested but flagged:

| anomaly             | meaning                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `totals-mismatch`   | The lines do not add up to the stated total. The grouping misread something.                      |
| `no-amount`         | A named product whose price never arrived on any of its rows. Dropped rather than priced at zero. |
| `unreadable-amount` | An amount that is not money.                                                                      |
| `unattached-note`   | A quantity or promotion row with no product above it.                                             |
| `dropped-receipt`   | Refused, or a second capture of a till transaction already seen.                                  |

Nothing is ever skipped silently. A shop that happened and did not arrive is
the one failure mode that leaves no trace of itself.
