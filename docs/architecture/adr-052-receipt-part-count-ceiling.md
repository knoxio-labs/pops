# ADR-052: No ceiling on receipt part count

## Status

Accepted — 2026-09-22

## Context

`UploadReceiptBodySchema.parts` (purchases) and its mirror on bfm,
`MobileReceiptUploadBodySchema.parts`, were each bounded to 8 with
`.max(MAX_RECEIPT_PARTS)` / `.max(MOBILE_RECEIPT_MAX_PARTS)`, and AppCore's
`ReceiptPart.maxPerReceipt` mirrored the same number so the phone refuses a
9th photograph before it ever sends one. A repo-root guard,
`scripts/ci/check-receipt-max-parts-drift.mjs`, existed only to keep the
three hand-mirrored constants from drifting apart.

Nothing in the history of any of the three files records why 8 was chosen.
Decided while designing the capture flow (2026-09-12, referenced from
POPS-3647): a full supermarket shop can run to more than 8 photographs, and
a person part-way through a long receipt should not be told to stop.

This ADR answers the two questions that decide whether a new number replaces
8 or the constraint is removed outright.

### What already bounds an upload independent of part count

- Purchases' JSON body limit (`JSON_BODY_LIMIT_BYTES`,
  `pillars/purchases/src/api/app.ts`): 20MB.
- Bfm's upload limit (`MOBILE_UPLOAD_MAX_BYTES`,
  `pillars/bfm/src/contract/receipt.ts`): 12MB, the tighter of the two and
  therefore the one that matters for a mobile upload.
- `ReceiptPageBudget.standard` (`clients/ios/.../ReceiptPageBudget.swift`):
  every captured page is downscaled to a 2400px longest edge and re-encoded
  at JPEG quality 0.8 before it is sent.

A page at that budget is, in practice, well under a megabyte: 2400×1800 at
quality 0.8 is a compressed photograph of mostly white paper and short text
runs, not a busy natural scene. Even a generous worst case — 1.5MB of raw
JPEG for one page, which is already above what this budget produces for a
till receipt — becomes roughly 2MB once base64 expands it by 4/3. Twelve
such pages is already about 24MB, twice bfm's 12MB ceiling; six is
comfortably inside it. In other words, the _byte_ limit already imposes an
effective page-count limit in the range the "at most 8" number was picking
by hand, and it does so from a measured constraint (encoded size) rather
than a guessed one.

This is the answer constraint 4 (ADR-046/ADR-048's body-cap discipline)
always intended: a count that is a proxy for a size should not be enforced
as a count when the size itself is already enforced. Keeping both would
mean carrying a second number in three places whose only job is to
approximate what `MOBILE_UPLOAD_MAX_BYTES` already guarantees exactly.

Neither purchases' 20MB limit nor bfm's 12MB limit needs to move. Twelve
megabytes is the tighter of the two and already provides more headroom than
a realistic long shop needs at the current page budget; nothing in this
investigation found a case where a legitimate receipt would need more.

### The read itself

`POST /receipts` sends every part to Claude in one message and reads the
model's text back (`pillars/purchases/src/ingest/receipt/anthropic-vision.ts`).
Two things were checked:

- **Cost/output budget.** `MAX_TOKENS = 8_000` bounds only the model's
  _output_ (the extracted JSON), not its input, and is already sized for "a
  receipt is a few hundred short lines at most" regardless of how many
  photographs it took to capture them. Removing the part-count cap does not
  change this.
- **Latency.** There is no per-request timeout configured for
  `client.messages.create`, and no code-level evidence bounding how long a
  many-image read may take. This is a real, currently-unmeasured risk: a
  request built from an uncapped number of images (bounded only by the byte
  ceiling above, which still permits on the order of ten pages) could run
  long enough to need streaming or a different call shape. It has not been
  exercised in production with more than a handful of pages. This is
  unresolved and tracked as **POPS-4319** (filed under POPS-2452), not
  something this ADR can settle by reading the code.

## Decision

**Remove the count ceiling.** `MAX_RECEIPT_PARTS` (purchases) and
`MOBILE_RECEIPT_MAX_PARTS` (bfm) are deleted along with their schemas'
`.max()` calls, and AppCore's `ReceiptPart.maxPerReceipt` is deleted with
them. `scripts/ci/check-receipt-max-parts-drift.mjs` is deleted too: once
there is no numeric ceiling to mirror, the guard has nothing left to
compare.

The existing byte limits (`JSON_BODY_LIMIT_BYTES` = 20MB on purchases,
`MOBILE_UPLOAD_MAX_BYTES` = 12MB on bfm) remain unchanged and become the
sole real limit on an upload's size, exactly as the mobile body-cap
discipline (ADR-046, ADR-048) already intended. A receipt long enough to
exceed 12MB of encoded photographs is refused with the same "too large"
response an oversized single photograph already gets today — there is
nothing part-count-specific left to refuse on.

## Consequences

- A shop of any length is accepted end to end as long as its encoded photos
  fit in bfm's 12MB upload limit — which, at the current page budget, is
  comfortably more than 8 photographs.
- The staging screen's `over-cap` state and its refusal copy
  (`purchases/staging`) are deleted rather than kept as a record: a count
  that no longer exists has nothing to refuse against (POPS-3820).
- The old capture flow's cap-refusal copy is deleted the same way
  (POPS-3819).
- Any future refusal a receipt upload can hit is the existing byte-size
  refusal, which already states what it refused and why
  (`pillars/bfm/src/api/rest/payload-too-large.ts`) — there is no separate
  "too many parts" message to keep in sync with a number.
- The many-image read latency question is open and tracked as **POPS-4319**;
  this ADR does not resolve it, only records that it exists and is
  independent of the part-count question this ADR does settle.
