# Purchase detail inside a transaction

A bank transaction records that money moved and nothing about what was bought.
This panel answers the other half from the `purchases` pillar, opened from a
transaction row's action menu.

It is the frontend end of a sanctioned cross-pillar leg (ADR-040): it calls the
generated client in `../../../purchases-api/`, which CI regenerates from the
producer's vendored snapshot and diffs, so a contract change cannot land here
without the client following. Nothing here imports the purchases app — only its
wire contract crosses the seam, and the view types are aliased off the generated
types rather than mirrored (`types.ts`).

## `GET /reconcile/links`, never `GET /reconcile/queue`

The queue answers "what still wants a decision". Confirming a link removes its
charge from the queue, and an auto-link source never enters it at all — so a
lookup built by scanning the queue would report "no purchase" for exactly the
two states where the relationship is most certain. The reverse lookup indexes
the link table and reports each link's `confirmedAt` rather than filtering on
it.

That field is why a charge row is not one line of text. A derived link is what
the matcher currently believes and a later sweep may withdraw it; a confirmed
one is a decision somebody made. Rendering them alike would present a guess as
a settled fact, so they carry different badges and a derived link says out loud
that nobody confirmed it.

## Three shapes, not one

The route returns a **list** of orders because one transaction settling several
is a modelled case, not an anomaly. So the panel handles a transaction with no
order (an empty list and a 200 — the ordinary answer for most of a statement,
rendered as a plain statement rather than an error), a single order, and a
combined settlement where several orders share the charge.

`settlement.ts` computes what the orders add up to against the transaction on
screen. It exists for the residual: listing the orders and stopping would turn
"$11.28 of this charge is unexplained" into a view that looks complete. Like
the merchant lens's unexplained bucket it is never clamped — negative means the
links claim more than the transaction is worth, which is a real defect worth
seeing. Each side is summed with its own signs and only the two totals are
compared as magnitudes, since finance publishes decimal dollars and purchases
counts signed integer cents.

It also refuses to add across currencies, for the reason the merchant lens
groups by them: a charge's currency is the producer's _settlement_ currency,
which it defaults from the order and does not promise matches the card's, so a
set of charges naming more than one is reported as mixed rather than totalled
under whichever code came first. The per-order shares stay visible either way,
each in the currency it settled in.

## What "unavailable" means here

The failure notice draws a pillar that is down differently from a request that
was refused, because only the second says anything about the transaction on
screen. That split is made on how the answer failed, not on its status code:
this client is pinned to a same-origin proxy path, and an unrouted proxy
answers `200` with the SPA's own `index.html`, which reaches the SDK as a
parser error under a success status. `purchases-api-helpers.ts` calls anything
that did not arrive as the pillar's own JSON body a transport failure, and
drops its wording rather than re-throwing it — the shell installs a global
query-cache handler that pattern-matches fetch's phrasing into a "check your
connection" toast across the whole app, which a sibling pillar's outage has not
earned.

## What this does not do

There is no indicator on the transactions table itself, so a purchase-backed
row looks like any other until it is opened. The reverse lookup takes one
transaction URI, and drawing that column over a 50-row page would mean 50
cross-pillar requests; a batched lookup is POPS-2360.
