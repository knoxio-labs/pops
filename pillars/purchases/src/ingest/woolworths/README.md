# Everyday Rewards adapter

Turns the JSON the `extension/` Chrome extension exports into
`CreatePurchaseInput`s. Woolworths publishes no export, so the extension is
the only source; this directory is what makes its output trustworthy.

```
extension/  →  export.json  →  parseWoolworthsExport()  →  POST /purchases
```

Run it with
`POPS_INTERNAL_API_KEY=<key> pnpm --filter @pops/purchases ingest:woolworths -- <file>`.
The key's account needs `purchases.source` and `purchases.purchase`; a real
run aborts before its first request without one.

Add `--dry-run` to parse and report without writing — that path calls the
pillar not at all and needs no key.

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
each` costing $18.48, another called `PRICE REDUCED BY $7.26 each`costing
nothing — **and the total still reconciles exactly.** No arithmetic check
catches this, which is why`rows.ts` has its own tests asserting the
grouping rather than the sum. See the header comment there.

**The time is a local wall clock with no zone.** `20:39 24/07/2026` read as
UTC misplaces every purchase by ten or eleven hours, moving an evening shop
into the next day and a month-end one into the next month. `time.ts` derives
the offset per timestamp, because Sydney is +10:00 for part of the year and
+11:00 for the rest.

**The date is day-first.** `07/08/2026` is 7 August, not 8 July. Both
readings parse and both look plausible.

**Weighed goods do the same trick with a different wording.** Fruit,
vegetables and the deli price by the kilo, and the money is on the weight
line:

```
Orange Navel Loose
0.202 kg NET @ $2.90/kg               0.59
```

Read as a product that is an item called `0.202 kg NET @ $2.90/kg`, with
the oranges dropped for having no price — and $0.59 is still exactly what
was paid. It is not a quantity either: 0.202 is not a count, and coercing
it gives a bag of oranges a quantity of zero.

**Money coming back is not a product.** `Everyday Extra 10% Discount`,
`BUY 2 for $4.60`, `CORN HARVEST OFFER`, `MONSTER ENERG OFFER` — four
wordings across one account with nothing in common but the minus sign,
which is what the code keys on. Left among the items they become products
with negative prices, and the receipt still adds up.

All three were found by running this adapter over real exports rather than
by reading the schema, and every one produced a receipt that reconciled
exactly to its stated total. The current bar: **413 receipts spanning three
years, 2079 lines, $11,901.74, zero anomalies.**

## Decisions worth knowing

**The key is the till transaction, not the API id.**
`store-POS-transaction-date`, e.g. `1034-066-3184-24072026`. The
`activityDetailsId` is an opaque blob whose stability across exports nothing
guarantees; the till transaction is printed on the paper. `POST /purchases`
is create-only and answers 409 on a repeat, so this key is what makes a
second export a no-op rather than a second copy of the year. The API id is
kept in `rawRef` so a receipt can still be traced back.

The same create-only rule has a consequence worth knowing before a
backfill: **improving this adapter does not correct what it already
wrote.** A re-import of the same receipts is rejected on `sourceOrderId`
regardless of whether the mapping changed, so a fix to the grouping only
reaches purchases ingested after it. Do a `--dry-run` and read the anomaly
count before the first real import.

**GST is not carried into `taxCents`.** Australian shelf prices include it,
so the line totals already contain the GST the receipt states separately.
Putting that figure in `taxCents` would make it appear twice in any sum of
components. It is not lost — `#` marks each GST-applicable line, and that is
carried through as `merchantCategory: 'gst-applicable'`.

**A receipt that states no payment is `unknown`, not `card`.** Nine of 413
real receipts carry no readable payment block. `card` would assert
something the merchant never said, and `cash` would be worse — that is
terminal, and would exclude a real card shop from reconciliation forever
(ADR-042).

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

| anomaly               | meaning                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `totals-mismatch`     | The lines do not add up to the stated total. The grouping misread something.                      |
| `no-amount`           | A named product whose price never arrived on any of its rows. Dropped rather than priced at zero. |
| `unreadable-amount`   | An amount that is not money.                                                                      |
| `unattached-note`     | A quantity or promotion row with no product above it.                                             |
| `dropped-receipt`     | Refused, or a second capture of a till transaction already seen.                                  |
| `unreadable-quantity` | `Qty 0 @ ...`. The count is refused (it would divide by zero) and the money on the row is kept.   |

Nothing is ever skipped silently. A shop that happened and did not arrive is
the one failure mode that leaves no trace of itself.
