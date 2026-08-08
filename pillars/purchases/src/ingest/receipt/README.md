# Receipt drop-zone

The escape hatch. Amazon and Woolworths have dedicated adapters because
they publish structured data; every other merchant does not, and a
photographed till slip is what there is. Coles and Bunnings start accruing
data the day this ships.

Unlike the other two adapters, the reading here comes from a **vision
model**, because crumpled thermal paper defeats OCR. That changes what the
module has to do: an adapter over structured data can be wrong in ways a
test catches, while a model can be wrong in ways nothing catches — unless
the source states its own answer.

## The correctness gate

A receipt prints its own total. That single fact is what makes a model's
reading admissible:

```
Σ lines + tax − discounts === the total the paper states
```

Exactly, to the cent (`gate.ts`). It is not a confidence score and there is
no threshold to tune. Getting the sum to agree by accident requires the
model to have misread the total in precisely the way it misread the lines.

This is also why `reconcile/` uses no AI at all: matching charges to
transactions is arithmetic with no stated answer to check against, so a
model would produce a plausible partition and nothing could tell.

**A failure is not a rejection.** The purchase happened and the photo
exists. It goes to review with the discrepancy stated in cents, because
"waiting to settle" and "we could not read it" must never look alike.

What the gate cannot catch, and does not pretend to: a reading whose
amounts are all correct and whose product names are all wrong. Money is
what reconciliation and spend analysis run on, and a wrong name is visible
to a human in a way a wrong cent is not.

## What the model is allowed to say

`extraction.ts` is deliberately small. Every field is something a person
can read off the photograph and check in a second, because everything the
model emits has to be checkable. Anything it would have to _infer_ — a
category, a merchant id, which department a line belongs to — is absent: an
inference cannot be validated against the paper, so it would be a guess
wearing the same clothes as a reading.

`discounts` is not a counter-example. A receipt prints its discounts, so
reading them is transcription like any other field. What is absent is
asking the model to decide that some _item_ line was really a discount.

Money arrives as a string. The model transcribes what is printed and this
layer parses it, so a malformed amount is a located failure rather than a
silent zero. Quantity is optional, and absent means the paper did not say —
inventing a 1 makes a weighed line look like a counted one.

## The vision call

`vision.ts` is a port: `read(image) -> raw model text`. The real one is
`anthropic-vision.ts`, ~90 lines of wiring with no judgement in it, because
everything that decides whether a reading may be believed is pure and
tested against fixtures. **No test reaches a real API** — one that costs
money and needs a network is one that gets skipped.

`read-receipt.ts` joins the three steps and returns one of:

| outcome        | meaning                                                         |
| -------------- | --------------------------------------------------------------- |
| `read`         | the model read it and the arithmetic agrees; admissible as fact |
| `needs-review` | read, but the figures disagree; a real purchase needing a human |
| `unreadable`   | nothing usable came back — **not** a receipt with no items      |

Those last two are deliberately distinct: "retry later" and "photograph it
again" are different actions, and a transport failure is not a statement
about the receipt.

**There is no retry-until-it-sums loop.** Re-rolling until the arithmetic
agrees selects for readings that pass the gate rather than readings that
are right, which is the exact property the gate exists to provide. The
prompt says so to the model too — a model that balances the books on
request destroys the only evidence there is.

The prompt and the extraction schema are two statements of one contract
with nothing else coupling them, so a test asserts the prompt names every
field the schema requires. Adding a field without teaching the model about
it fails there rather than silently producing extractions that lack it.

Usage, cost and latency go to the ai pillar through `@pops/ai-telemetry`,
so a drop-zone that quietly becomes expensive shows up where everything
else does.

## The endpoint

`POST /receipts` with `{ mediaType, dataBase64 }`. JSON rather than
multipart because a receipt is a phone photo — hundreds of kilobytes, not
hundreds of megabytes — and it keeps the surface describable in the same
ts-rest contract as everything else.

**The response is a discriminated union, not a purchase.** Collapsing the
three outcomes would lose the distinction the whole feature rests on:

| `kind`         | meaning                                              | written?                           |
| -------------- | ---------------------------------------------------- | ---------------------------------- |
| `created`      | the reading agreed with the paper                    | yes                                |
| `needs-review` | read, but the figures disagree with the stated total | no; the photo is kept and returned |
| `unreadable`   | nothing usable came back                             | no; the photo is kept              |

Two refusals happen before a model call is spent: `503` when no vision
model is configured, and `400` when the upload is not the image type it
claims. Both are answers the user can act on immediately, where the same
facts discovered inside the model come back as confusion that costs money.

**The photograph is stored before it is read.** If the model is down, or
reads it wrongly, or the figures disagree, the image is still on disk and
addressable — so a failed upload leaves evidence. Reading first and storing
only on success would discard exactly the receipts a human needs to see.

A receipt that merely states no **date** is not `needs-review`: it is
created, dated from the upload, and tagged `date-uncertain`, because losing
a shop that happened is worse than carrying an inferred date the tag stops
anyone mistaking for a stated one.

Re-uploading the same photograph is a `409`, and the check happens **before
the model is asked** — the hash is the key, so the duplicate is knowable
without paying for an answer whose only outcome is 409. Because
`sourceOrderId` is the image's SHA-256. A merchant order id would be better and does not exist: a
till slip carries a transaction number in a different place and format for
every chain, and a date-plus-total key would merge two identical coffees
bought an hour apart.

The drop-zone registers its own `receipt` source on first use — sources are
rows rather than a compiled enum (ADR-035), and every other one is
registered by whoever ingests through it. On use rather than at boot, so a
deployment that has never received an upload does not claim a source it has
never written to.

## Naming the merchant

Best-effort, against the entities contacts owns, so a photographed receipt
lands under the same merchant as the card transaction that paid for it
(`../../api/contacts/merchant.ts`).

**The bar is deliberately high, because `merchantEntityId` is operative
data.** A wrong entity silently files someone else's spending here and the
purchase looks perfectly ordinary while doing it. `merchantEntityName`
carries the receipt's own wording regardless, so declining to match costs
a link rather than the information — and unknown is a valid outcome, which
is the whole point of an escape hatch.

Two rules do the work:

- **Suffix one way only.** `Bunnings` matches a receipt saying `Bunnings
Warehouse`, because a trading name commonly carries a suffix its entity
  does not. The reverse is refused: a receipt saying `Coles` must not match
  `Coles Express`, which is a petrol station.
- **Ambiguity is not a tie to break.** Two candidates that both qualify are
  by construction similarly named, which is exactly when a human should
  look. It resolves to no match.

The search is seeded with the most identifying word rather than the whole
name, because contacts matches substrings in one direction only — asking it
for `Bunnings Warehouse` never finds `Bunnings`.

A contacts outage costs a link, never the purchase, and that guarantee sits
in the handler rather than in the resolver — a resolver that forgets to
catch must not be able to lose a receipt.

## Keeping the photograph

The image is not a by-product. When the gate refuses a reading, the only
way anyone settles what the receipt actually said is by looking at it — so
a drop-zone that extracts and discards has thrown away the evidence for
exactly the cases that need it.

`store.ts` is **content-addressed**: the file is named for the SHA-256 of
its own bytes, sharded one level on the hash prefix. That makes the
ticket's dedup requirement structural rather than a check someone has to
remember to write — the same photo lands on the same path, so a re-upload
is a 409 from the existing write path rather than a twin. It also means a
truncated upload cannot quietly overwrite a good one: different bytes,
different name.

Images live beside the database (`PURCHASES_RECEIPT_DIR`, else
`<dirname(sqlite)>/receipts`), so one volume holds the whole pillar, and a
purchase references one as `pops://purchases/receipt/<sha256>`.

`looksLikeImage` checks the magic number at the edge. "That is not a JPEG"
is something a user can act on immediately; a vision model's confusion
about it is not, and costs a call to discover. The check is deliberately
shallow — it catches a mislabelled or truncated upload, not a hostile one.

## Reading printed money

`../money.ts`, shared with the Woolworths adapter. The two sources see
different conventions — `-4.95` from a JSON payload, `-$4.95` from a photo,
and `$-4.95` from some terminals — so neither the sign nor the symbol is
stripped by position. It refuses a decimal comma rather than guessing:
`1,49` is one-forty-nine in most of Europe, and a parser that guesses turns
€1.49 into €149.
