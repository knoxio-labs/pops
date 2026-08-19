# Ingest adapters

Four today — `amazon/`, `amazon-digital/`, `woolworths/`, `receipt/` — and
email is coming. Each has its own README for what makes its source hard.
This file is what they have to agree on.

## Naming a purchase

`(source, sourceOrderId)` is UNIQUE. It is the only thing standing between
a re-import and a duplicated year of spending, so what an adapter puts
there is a decision rather than a detail.

**A key must distinguish two purchases a human would call different**, and
the case that breaks lazy keys is real rather than theoretical: in a
three-year Everyday Rewards export, **37 occasions had more than one shop at
the same store on the same day**. A `store + date` key merges 37 shops. A
`store + date + total` key survives that particular export by luck — two
identical baskets an hour apart is an ordinary thing to do, and a coffee
shop makes it certain.

The ladder, best first:

1. **The merchant's own order id.** Amazon states one, so `amazon` uses it
   verbatim. Nothing derived can beat an identifier the merchant already
   commits to.

   The `source` half of the key is doing real work there. Amazon issues
   digital order ids from a namespace independent of its physical one, so
   `amazon-digital` is its own source rather than a widened `amazon`: the
   two spaces are free to collide, and under one source a collision would
   come back as the 409 a backfill counts as "already had it" — a whole
   order lost inside a run that reported success.

2. **The transaction the till recorded.** Woolworths states no order id but
   prints `POS 066 TRANS 3184` — a counter per register per store.
   `store-POS-transaction-date` gives 413 distinct keys from 413 receipts,
   including all 37 back-to-back occasions, because two registers never
   share a transaction number at the same moment.
3. **The bytes of the evidence.** An uploaded receipt has neither, so
   `receipt` uses the SHA-256 of the file. Re-uploading the same photograph,
   PDF or pasted body is then a 409 by construction rather than by a check
   someone remembered to write.

   Its weakness is the one a hash cannot fix: a photograph of a receipt and
   the merchant's PDF of the same purchase are different bytes and so
   different keys. `receipt/` therefore carries a second check on the
   receipt's stated instant and amount — see its README. No other adapter
   needs one, because the merchant already named the order.

**Never derive a key from date and total alone.** It cannot separate two
identical purchases, and the failure is silent — a merged pair looks exactly
like a single shop.

**Never key on an id whose stability is not promised.** Everyday Rewards
`activityDetailsId` is an opaque base64 blob that nothing says will survive
a re-export; it is kept in `rawRef` for tracing and is not the key.

A derived key must be reproducible from the receipt alone. The Woolworths
key is printed on the paper, so re-deriving it from a fresh export yields
the same string — which is what makes a second import a no-op rather than a
second copy.

## Naming a product

Unsolved, deliberately, and tracked as POPS-243.

Amazon states an ASIN and it is stored as `sku`. Woolworths states nothing —
line items carry a name and a price and no identifier at all — and an
uploaded receipt states less. So the same product bought at two shops,
or at one shop twice under slightly different receipt-speak, does not group.

That kills the highest-signal output of the whole feature, which is why it
has its own issue rather than a guess here. The failure mode to design
against is over-eager merging: two genuinely different products collapsing
into one corrupts spend attribution in a way that is very hard to notice
afterwards. Leaving items ungrouped is the safer wrong answer.

`GET /analytics/product-leaderboard` groups on what a source does state —
the sku, else the normalised printed name, else nothing — and labels every
group with which of the three it used, rather than waiting for this to be
solved or pretending it is. The rule is `identifyProduct` in
`src/db/services/product-identity.ts`.

## Checksums are not keys

`checksum` detects **change**; `sourceOrderId` detects **identity**. They
answer different questions and an adapter needs both.

Hash what was _mapped_, not the payload it came from — otherwise a source
reordering its JSON marks a year of history as changed. Encode
injectively: joining fields on a delimiter is not injective when any field
is free text, so `["a~b","c"]` and `["a","b","c"]` hash identically unless
the encoding is JSON.

## Money and time are shared

`money.ts` reads printed amounts in any locale, and `local-time.ts` resolves
a wall clock to an instant. Both exist because two adapters needed them and
the second one found the first one's bugs — a decimal comma that made every
European receipt unreadable, and a currency symbol stripped by position that
refused `-$4.95`. Add to them rather than reimplementing per source.

## Shipping is allocated to lines, not just totalled at the order

`purchase_items.allocatedShippingCents` feeds `landedCostCents()` — what a
line actually cost to get into the house, not its sticker price. An adapter
with an order- or shipment-level shipping figure and no per-line one (amazon,
receipt) splits it across its lines with `allocation.ts`'s `allocateProRata`,
pro-rata by each line's own `lineTotalCents`. Value, not unit count: a $400
monitor and a $2 cable in the same box did not cost the same to ship, and
value is the basis amazon's own `Total Amount` already uses for its other
per-line allocations (tax, discounts).

The allocation always sums back to the shipping figure it split, to the
cent — `allocateProRata` uses the largest-remainder method in `BigInt` so
the rounding residue lands deterministically rather than being dropped or
invented. `woolworths` never sets this: its shipping is always zero
(`woolworths/receipt.ts`), so there is nothing to allocate.
