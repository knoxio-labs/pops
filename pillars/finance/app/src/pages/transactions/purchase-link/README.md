# The purchase indicator on the transactions table

A purchase-backed transaction used to look identical to every other one until
somebody opened its row menu, which meant the panel in `../purchase-detail/`
was found only by people who already suspected it was there. This column says
so on the row.

## Why it needed a new route

`GET /reconcile/links` takes exactly one transaction URI. The table pages at
50, so a column built on it would be 50 cross-pillar requests to draw one
screen — which is why the column was deferred rather than written badly.
`POST /reconcile/links/batch` takes up to 500 URIs and answers each with
counts, so the whole loaded list costs a request per 500 rows.

The two routes cannot disagree: the plural form is the singular one's own
answer counted, and the producer holds them together in
`pillars/purchases/src/api/__tests__/transaction-links-batch-api.test.ts`.

The chunk size is not a number kept in step by memory. This app cannot import
`@pops/purchases` — that is why the leg vendors a snapshot — so
`batch-size.test.ts` reads `maxItems` out of `contracts/purchases.openapi.json`
and holds the constant against it. A producer that lowers the cap fails that
test on the re-vendor rather than as a 400 on every page load.

## Three states, because two would be a lie

`confirmedAt` is the only thing separating a decision somebody made from what
the matcher currently believes and a later sweep may withdraw. So the indicator
carries the confirmed and derived counts apart, exactly as the panel does, and
renders three states rather than a tick: confirmed, auto-linked, and part
confirmed where a transaction holds both. A single "has a purchase" mark would
report the engine's guess as settled on every row it drew — the failure
`confirmedAt` exists to prevent, repeated at a hundred rows a screen instead of
one panel at a time.

A transaction no order explains renders **nothing**. That is most of a
statement, and a column of "no" is a column of noise. It is also the same
absence the producer expresses by leaving an unlinked URI out of its response,
so nothing here has to translate a zero into a blank.

The count of orders appears only on a combined settlement. Every ordinary row
settles one order, and "1 order" on nearly every row is a column nobody reads.

## Money is not on this row

The batch sums none, and the column shows none. A charge's currency is the
producer's settlement currency and one transaction can settle orders in more
than one, which is why `../purchase-detail/settlement.ts` refuses to add across
them. A figure on the row would be that same forbidden sum with less room to
explain itself. The panel has the per-order shares, each in the currency it
settled in.

## What a refusal looks like

Nothing. The column is decoration on a page that is fully useful without it, so
a purchases outage draws no indicators and raises no error: `retry: false`, and
the query's failure never reaches the page. The reader who wants to know why
opens the row, where the panel names which side failed and offers the retry.
