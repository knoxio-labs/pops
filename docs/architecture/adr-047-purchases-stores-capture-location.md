# ADR-047: `purchases` stores where a receipt was photographed

## Status

Accepted — 2026-08-19. Records a decision already implemented in `pillars/purchases` (POPS-1326, POPS-1327), and extends it to the mobile write surface ADR-046 governs.

## Context

`POST /receipts` accepts a photograph and reads it with a vision model. Everything it learned about a purchase used to come off the paper: the merchant, the lines, the total, and a timezone the model infers from the printed address. Two facts the _photograph_ carries were discarded — `DateTimeOriginal`, which says when the shutter fired, and the GPS IFD, which says where — and a phone at the till knows both directly, better than any inference.

The capture time is uncontroversial: a receipt that prints no date is dated from its upload, which is a fact about the server rather than about the shop, and the shutter is strictly closer to the event.

The location is not, and that is what this ADR is for. Location-of-purchase is genuinely useful — it disambiguates two branches of the same chain, and it is the only spatial signal a receipt-based ledger can get. It is also the most sensitive thing an uploaded image carries, and harvesting it from every photograph is the kind of decision that gets made by accident when someone reaches for an EXIF library and the coordinates come along in the returned object.

Three things frame the answer.

- **POPS is single-user and self-hosted.** The data is the operator's own, on the operator's own hardware, behind Cloudflare Access. There is no second party this discloses anything to. That is not a reason the question does not arise — it is the reason the answer can be yes.
- **The repo's existing posture on EXIF was to strip it.** `pillars/inventory` and `pillars/food` re-encode uploaded images through `sharp`, and `libs/ui`'s `useImageProcessor` re-encodes through a canvas. All three drop EXIF, incidentally rather than as a stated position, and none of them holds financial records. Nothing in the repo stated a position on storing location before this.
- **A standing rule already covers prompts.** Only merchant descriptions reach the Anthropic API; never account or card numbers. Coordinates are on the same side of that line, and deciding to _store_ location changes nothing about that.

The decision was taken by the operator, deliberately, and the code landed before this record did. That is the gap this ADR closes: the reasoning currently lives in a migration comment and a schema docstring, which is not where a reader looks for "was this on purpose".

## Options Considered

| Option                                                                    | Pros                                                                                                                                                                                   | Cons                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read capture time only; leave GPS unread                                  | No new sensitive data at rest                                                                                                                                                          | Discards the one spatial signal the system can get, and does so by silence rather than by decision — the next person to touch the reader has nothing telling them the omission was deliberate                                                  |
| Store the coordinate as columns on `purchases`                            | Simplest write path; no join                                                                                                                                                           | A column on the order row rides into every `SELECT` over an order, and from there into every serializer and every future read path. The leak would be a field nobody added on purpose                                                          |
| Use a general EXIF library and keep what looks useful                     | Less code; handles more containers                                                                                                                                                     | The library decides what the pillar learns about a person. Serial numbers, lens data, camera owner name and thumbnails arrive in the same object, and "we only read four fields off it" is a convention the next change drops without noticing |
| **Store it in its own table, read by nothing that does not ask (chosen)** | A location has to be joined deliberately. The provenance of each field is recorded beside it. The purchase row is unchanged, so no existing read path can start returning a coordinate | A second table and a second write; a reader has to know it exists                                                                                                                                                                              |

## Decision

**`purchases` records what the device and the photograph said about the capture, including location, in its own `purchase_capture` table** (migration `0006_purchase_capture.sql`). Five constraints come with it.

1. **Its own table, not columns on `purchases`.** One row per order, every column nullable, keyed by `purchase_id` with `ON DELETE CASCADE`. The privacy property is structural rather than a matter of care: a coordinate cannot appear in a response nobody meant to put it in, because reaching it takes a join no read path performs today.

2. **Every field records where it came from.** `captured_at_source` and `location_source` are each `client` or `exif`, constrained by a `CHECK`. A time the handset stated and a time read off the file are different grades of evidence, and a consumer that cannot tell them apart will eventually treat them as the same.

3. **Nothing that is not a place is stored.** Out of range, half a coordinate, a rational over a zero denominator, or a garbled hemisphere all resolve to no location — enforced in the reader _and_ restated as column `CHECK`s, because the constraint has to hold for a writer that has not been written yet.

4. **No coordinate reaches a model prompt.** The capture facts are resolved after the vision call and never enter it. The pillar's standing rule is that only what the paper shows goes to the Anthropic API, and a coordinate is on the same side of that line as a card number.

5. **A location is never logged, never put in a URL or query string, and never echoed in an error.** A refusal says the body did not match the contract, not what was in it. This binds at the perimeter as well as in the pillar — see below.

**It is named for the capture, not for the purchase**, everywhere it appears. EXIF records where the _photograph_ was taken, and a receipt photographed at home a week later carries home's coordinate. A name asserting otherwise would have every consumer treating it as the shop's location.

### The mobile surface

bfm's `/mobile/purchases/receipts` accepts the same `capture` object and **forwards it verbatim, judging none of it**. That follows from ADR-046 rather than being a new decision: the surface is a proxy of content the device captured, and the pillar that owns the record owns the judgement. Concretely, bfm does not decide whether a capture time is plausible — it does not hold the upload instant that decision is made against, and a second rule there is the same mistake as the second dedup key ADR-046 forbids.

Two things bfm _does_ do, both for the same reason the media-type list is closed on that surface: it mirrors the producer's bounds so a coordinate the producer would refuse is refused at the perimeter instead of arriving as an upstream error the phone cannot act on, and it keeps every field optional so an app build predating the field keeps working. The client is distributed rather than deployed (ADR-043), so old versions call this route from hardware nobody can roll forward.

## Consequences

- `purchases` holds location data for the first time. Its SQLite file is already replicated by Litestream (ADR-026) and its receipt images already sit beside it, so the backup mechanism does not change — but the sensitivity of that volume has gone up, and the operator's offsite encryption is doing more work than it was.
- **No read path returns a location today.** That is the design, not an oversight: the table exists so the evidence is kept, and each future reader is a deliberate decision to expose it. A feature that wants to draw a purchase on a map is a change to make on purpose.
- Deleting a purchase cascades the capture row. Deleting the receipt image is a separate act, and the EXIF is still in the bytes on disk — so purging location means purging images, not rows.
- Reading EXIF server-side means it works for any uploader, not only the app; it works for _no_ uploader that re-encodes first, which includes the fleet's own web upload path. That is why the client-supplied half exists rather than being redundant with it.
- Nothing is backfilled and nothing could be. Uploads already on disk still carry whatever EXIF they arrived with, but the purchases built from them have dates and zones a re-read would move, and silently re-dating a reconciled order is not a migration's business.
- The next pillar to accept phone-captured content inherits the shape of this rather than re-deciding it: sensitive derivations live apart from the record they describe, and provenance is stored beside the value.
