# Receipt drop-zone

The escape hatch. Amazon and Woolworths have dedicated adapters because
they publish structured data; every other merchant does not, and what there
is instead is a photographed till slip, the PDF invoice a merchant emails,
or the body of an order confirmation. Coles and Bunnings start accruing
data the day this ships.

Unlike the other two adapters, the reading here comes from a **model**,
because crumpled thermal paper defeats OCR and every merchant lays out an
invoice differently. That changes what the module has to do: an adapter
over structured data can be wrong in ways a test catches, while a model can
be wrong in ways nothing catches — unless the source states its own answer.

## Three shapes, one path

A photograph, a PDF and a pasted body are the same problem: a document that
states its own total. So they are stored, keyed, read, gated and written by
the same code, and only three things switch on which shape arrived — the
magic-number check at the edge, the content block sent to the model, and
one paragraph of the prompt.

`extraction.ts`, `gate.ts` and `purchase.ts` do not switch on it at all.
They never see bytes: one sees the model's text, one sees an
`ExtractedReceipt`, one sees a stored file's hash. That is why growing a
second and third intake shape was a change to the edge rather than to the
part of this module that decides what may be believed.

**PDF needs no text-extraction library.** The pinned `@anthropic-ai/sdk`
types `DocumentBlockParam` with a base64 PDF source, so the model reads the
file. There is no `pdf-parse`, no poppler and no rasteriser anywhere in the
fleet, and this did not add one.

A pasted body arrives base64-encoded like everything else rather than as a
bare string. One representation means one content-addressed store, one
dedup key and one edge check for every shape; the alternative forks the
pipeline from the contract down to save a client a call to `TextEncoder`.
It is decoded once, at the single boundary that needs characters — the
plain-text content block.

## The correctness gate

A receipt states its own total, whether it was printed on thermal paper,
generated as an invoice or sent as an email. That single fact is what makes
a model's reading admissible, and it is why the same gate serves all three:

```
Σ lines − discounts + surcharges (+ tax, if the prices exclude it) === the stated total
```

Tax is tried both ways, because two conventions exist and both are
ordinary: Australia, the UK and the EU print prices with tax already in
them and state it as a fact about the total, while the United States adds
it. Which one applies is not inferred from the merchant or the address —
the receipt's own numbers answer it, and only one can reconcile unless the
tax is zero, when they are the same sum. When the price contained it,
`taxCents` is stored as zero, because carrying it as a component too would
make it appear twice in any sum of parts.

Surcharges are the other direction: a card surcharge, small-order fee or
delivery charge is real money the merchant added, and none of the other
components describe it. A real ALDI receipt is $24.05 of groceries, a 12c
credit surcharge and a $24.17 total — without somewhere to put the fee it
can never reconcile, and most Australian card receipts carry one. An
emailed order almost always carries a delivery charge, which is the same
shape and goes to the same place.

That last one is a compromise. `purchases` has a `shippingCents` column and
this adapter does not write it, so delivery is visible as money the
merchant added and not as delivery specifically. The arithmetic is right
either way; the analytical loss is real and separate.

Exactly, to the cent (`gate.ts`). It is not a confidence score and there is
no threshold to tune. Getting the sum to agree by accident requires the
model to have misread the total in precisely the way it misread the lines.

This is also why `reconcile/` uses no AI at all: matching charges to
transactions is arithmetic with no stated answer to check against, so a
model would produce a plausible partition and nothing could tell.

**A failure is not a rejection.** The purchase happened and the upload
exists. It goes to review with the discrepancy stated in cents, because
"waiting to settle" and "we could not read it" must never look alike.

**The sum agreeing is necessary, not sufficient.** A discount the model
files among the `lines` instead of in `discounts` reconciles perfectly —
`$10.00` and `−$2.00` against a stated `$8.00` — so the arithmetic check
alone would admit it, and the purchase would carry an item worth less than
nothing while per-item spend quietly nets out. A negative line is therefore
refused outright (`negative-line`), because `discounts` is the channel for
a reduction and it normalises the sign.

What the gate cannot catch, and does not pretend to: a reading whose
amounts are all correct and whose product names are all wrong. Money is
what reconciliation and spend analysis run on, and a wrong name is visible
to a human in a way a wrong cent is not.

## What the model is allowed to say

`extraction.ts` is deliberately small. Every field is something a person
can read off the upload and check in a second, because everything the model
emits has to be checkable. Anything it would have to _infer_ — a category,
a merchant id, which department a line belongs to — is absent: an inference
cannot be validated against the source, so it would be a guess wearing the
same clothes as a reading.

It is also the same for all three shapes. There is no per-kind field, which
is what keeps the gate, the mapper and the reviewer's view from having to
know how a receipt arrived.

`discounts` is not a counter-example. A receipt states its discounts, so
reading them is transcription like any other field. What is absent is
asking the model to decide that some _item_ line was really a discount.

Money arrives as a string. The model transcribes what is stated and this
layer parses it, so a malformed amount is a located failure rather than a
silent zero. Quantity is optional, and absent means the source did not say
— inventing a 1 makes a weighed line look like a counted one.

## The model call

`vision.ts` is a port: `read(parts) -> raw model text`. The real one is
`anthropic-vision.ts`, wiring with no judgement in it, because everything
that decides whether a reading may be believed is pure and tested against
fixtures. **No test reaches a real API** — one that costs money and needs a
network is one that gets skipped.

The prompt is **composed from the shapes actually uploaded**, not switched
on one of them. Each kind contributes what is specific to how it misleads a
reader, and nothing else:

| shape | what it needs told                                                                  |
| ----- | ----------------------------------------------------------------------------------- |
| image | consecutive frames overlap, so a repeated line is one line                          |
| pdf   | read every page; letterhead, addresses, terms and page furniture are not line items |
| text  | markup, tracking links and footers are not line items; read only the order in hand  |

Warning a model reading a PDF about overlapping frames invents a problem it
does not have. Not warning one reading photographs about them produces a
shop whose lines are counted twice. Composition is also why a submission
may mix shapes — the merchant's PDF beside a photo of the till slip is one
purchase carrying both as evidence, not a conflict to refuse.

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

`POST /receipts` with `{ parts: [{ mediaType, dataBase64 }] }`, where
`mediaType` is one of the four image types, `application/pdf` or
`text/plain`. JSON rather than multipart because these are phone photos and
invoices — hundreds of kilobytes, not hundreds of megabytes — and it keeps
the surface describable in the same ts-rest contract as everything else.
The API's own 20mb body limit is the effective ceiling; past it the request
is a 413 before this route sees it.

**Several parts, one receipt.** A full supermarket shop does not fit in one
frame, so the parts are an ordered sequence covering one receipt, top to
bottom. They go to the model in a single call and produce one extraction,
one gate check and one purchase, which carries every part as evidence.
Eight is the cap: each part is paid for in that call, and a receipt needing
more frames is a scanner's job. A PDF or a pasted body is ordinarily the
whole receipt and arrives on its own.

Nothing bounds a PDF's page count here. Anthropic's own limit is what
applies, and a document past it comes back as `unreadable` with the
transport failure quoted — which is the right answer (evidence kept, user
told) even though it is not the clearest one.

Consecutive photographs overlap, so the same lines appear at the bottom of
one and the top of the next. The prompt says so and says a repeated line is
one line. If the model double-counts anyway the sum exceeds the stated
total and the receipt goes to review — the arithmetic is the backstop, not
a second pass over the images. Deduplicating repeated lines in code was
rejected for the same reason the gate refuses to guess: two identical
coffees on one receipt are indistinguishable from an overlap artefact, so
it would silently delete real lines.

The key is the digest of the parts in order, so re-sending the same set is
still a 409. One part keeps its own hash as the key, which leaves a single
photograph or PDF traceable from its `pops://` URI at a glance.

A photograph of a receipt and the merchant's PDF of the same purchase are
different bytes, so the key cannot see that they are one shop — and should
not, because they are not one file. What recognises them is the same check
that catches the same paper photographed twice: a purchase already held at
the stated instant for the stated amount. That is the only signal available
here, which is why it exists.

**The response is a discriminated union, not a purchase.** Collapsing the
three outcomes would lose the distinction the whole feature rests on:

| `kind`         | meaning                                              | written?                            |
| -------------- | ---------------------------------------------------- | ----------------------------------- |
| `created`      | the reading agreed with the receipt                  | yes                                 |
| `needs-review` | read, but the figures disagree with the stated total | no; the upload is kept and returned |
| `unreadable`   | nothing usable came back                             | no; the upload is kept              |

Two refusals happen before a model call is spent: `503` when no model is
configured, and `400` (`NOT_THE_STATED_TYPE`) when the bytes are not the
media type the upload claimed. Both are answers the user can act on
immediately, where the same facts discovered inside the model come back as
confusion that costs money.

**The upload is stored before it is read.** If the model is down, or reads
it wrongly, or the figures disagree, the file is still on disk and
addressable — so a failed upload leaves evidence. Reading first and storing
only on success would discard exactly the receipts a human needs to see.

A receipt that merely states no **date** is not `needs-review`: it is
created, dated from the upload, and tagged `date-uncertain`, because losing
a shop that happened is worse than carrying an inferred date the tag stops
anyone mistaking for a stated one.

Re-uploading the same file is a `409`, because `sourceOrderId` is its
SHA-256. The check happens **before the model is asked** — the hash is
known the moment the bytes are stored, so a duplicate costs nothing rather
than buying an answer whose only outcome is 409.

A merchant order id would be better and is not available: a till slip
carries a transaction number in a different place and format for every
chain, and a date-plus-total key would merge two identical coffees bought
an hour apart. A PDF invoice does state one, and this schema does not ask
the model for it — reading it would make an emailed confirmation and the
invoice for the same order dedup against each other, which is right, and is
a change to what the natural key means rather than a field to add quietly.

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

## Keeping the evidence

The uploaded file is not a by-product. When the gate refuses a reading, the
only way anyone settles what the receipt actually said is by looking at it
— so a drop-zone that extracts and discards has thrown away the evidence
for exactly the cases that need it. That holds for a pasted body as much as
a photograph: the paste is stored byte-for-byte rather than re-encoded,
because a body normalised on the way in can no longer be compared against
what the sender actually saw.

`store.ts` is **content-addressed**: the file is named for the SHA-256 of
its own bytes, sharded one level on the hash prefix, under an extension
per media type. That makes the ticket's dedup requirement structural rather
than a check someone has to remember to write — the same file lands on the
same path, so a re-upload is a 409 from the existing write path rather than
a twin. It also means a truncated upload cannot quietly overwrite a good
one: different bytes, different name.

Files live beside the database (`PURCHASES_RECEIPT_DIR`, else
`<dirname(sqlite)>/receipts`), so one volume holds the whole pillar, and a
purchase references one as `pops://purchases/receipt/<sha256>`. ADR-042
says evidence belongs in the `documents` pillar instead; that pillar has no
write surface at all today, so this is where it lives until POPS-1528 moves
it, and these URIs migrate with everything else.

`looksLikeMediaType` checks the first bytes at the edge. "That is not a
JPEG" is something a user can act on immediately; a model's confusion about
it is not, and costs a call to discover. The check is deliberately shallow
— it catches a mislabelled or truncated upload, not a hostile one.

A PDF is identified by `%PDF-` and the version that follows is not checked;
refusing a digit would refuse real invoices. Text has no magic number, so
what stands in for one is that the bytes decode as UTF-8 and are not
entirely whitespace. That is not a formality: without it, every mislabelled
binary would sail through the one check that exists to catch exactly that,
and be billed for.

## Reading printed money

`../money.ts`, shared with the Woolworths adapter. The two sources see
different conventions — `-4.95` from a JSON payload, `-$4.95` from a photo,
and `$-4.95` from some terminals — so neither the sign nor the symbol is
stripped by position.

A decimal comma is read, not refused: European receipts are unreadable
otherwise. It is mostly not a guess. `1,49` is one-forty-nine whichever
convention is in play, because no locale groups digits in twos, and a
number carrying both separators states its own convention by which comes
last. Only a single separator with exactly three trailing digits is
genuinely ambiguous — `1,495` — and there the receipt's stated currency
decides.
