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

**Only the two Amazon exports state a product identity, and they state it in
Amazon's catalogue namespace.** That is a measurement, and it is the substrate
every repeat-purchase question stands on. `ingest/__tests__/product-identity.test.ts`
is where it is pinned; a new adapter is added to that file's `ADAPTERS` list
or it goes unmeasured.

| adapter          | states                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `amazon`         | an ASIN per line, from the export's own column                                                                                                              |
| `amazon-digital` | the same, read from the same column by the same reader (`amazon/fields.ts`)                                                                                 |
| `woolworths`     | nothing — an item row is `{prefixChar, description, amount}`, no identifier                                                                                 |
| `receipt`        | nothing, and by design: `receipt/extraction.ts` refuses to let a vision model infer an identifier, because an inference cannot be checked against the paper |

So an identifier is stored as a **pair** — `sku` and `sku_scheme` — never as
a bare string. The scheme says how far the identifier's meaning reaches:
`asin` is the same product wherever it appears, `merchant` means nothing
outside the source that issued it. Both halves travel as one value from the
request body to the row and back onto the wire, so no consumer can obtain an
identifier without the qualifier that says what it may be compared to.
`classify/batch.ts` is the first consumer to act on the distinction: it
groups one ASIN across sources and refuses to group a merchant-local number
across them.

The scheme is a claim about reach, so it is checked against the identifier
rather than taken on trust: an ASIN is ten upper-case alphanumerics, and a
four-digit store article number therefore cannot claim to be one — through
the wire schema or through an adapter running in-process, which never passes
through zod. A caller can still state an ASIN it invented; that is a false
statement rather than an accidental collision, and the accident is what the
pair was added to prevent.

An adapter that states nothing writes nothing. **NULL means the source named
no product**, not that a transcription was skipped, and two NULLs are not a
match — a `GROUP BY` that folded them would put one verdict on an entire
merchant.

That leaves the open problem, tracked as POPS-243, correctly scoped: for
Woolworths and for uploaded receipts there is no key to normalise _toward_,
so the job is not "map receipt-speak onto a known product" but "mint a
product identity from a printed name, with nothing to anchor it to". Such an
identity is a POPS judgement, not a merchant's word, and it does not belong
in this column — `sku` holds what a source stated. The failure mode to design
against is over-eager merging: two genuinely different products collapsing
into one corrupts spend attribution in a way that is very hard to notice
afterwards. Leaving items ungrouped is the safer wrong answer.

`GET /analytics/product-leaderboard` groups on what a source does state —
the sku, else the normalised printed name, else nothing — and labels every
group with which of the three it used, rather than waiting for this to be
solved or pretending it is. Because a printed name is only interpretable
against the till that printed it, the key is confined to the order's
merchant for every source except the ones that are a single merchant's own
feed: `receipt` is one source id for every shop, and merging on it would be
exactly the over-eager merge above. The rule is `identifyProduct` in
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
