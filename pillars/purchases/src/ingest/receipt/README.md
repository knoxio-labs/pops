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
category, a merchant id, whether a line is a discount — is absent: an
inference cannot be validated against the paper, so it would be a guess
wearing the same clothes as a reading.

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

## Reading printed money

`../money.ts`, shared with the Woolworths adapter. The two sources see
different conventions — `-4.95` from a JSON payload, `-$4.95` from a photo,
and `$-4.95` from some terminals — so neither the sign nor the symbol is
stripped by position. It refuses a decimal comma rather than guessing:
`1,49` is one-forty-nine in most of Europe, and a parser that guesses turns
€1.49 into €149.
