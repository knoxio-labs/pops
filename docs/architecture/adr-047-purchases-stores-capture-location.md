# ADR-047: `purchases` reads and stores where a receipt was photographed

## Status

Accepted — 2026-08-19.

## Context

`POST /receipts` accepts a photograph and reads it with a vision model. Until now everything it learned about a purchase came off the paper: the merchant, the lines, the total, and a timezone the model infers from the printed address. Two facts the _photograph_ carries were being discarded — `DateTimeOriginal`, which says when the shutter fired, and the GPS IFD, which says where.

The capture time is uncontroversial and belongs to POPS-1326/POPS-1327: a receipt that prints no date is currently dated from its upload, and the shutter is strictly closer to the shop than the moment the file reached the server.

The location is not uncontroversial, and that is what this ADR is for. Location-of-purchase is genuinely useful — it disambiguates two branches of the same chain, it separates a card charge made where you were from one made where you were not, and it is the only spatial signal a receipt-based ledger can get. It is also the most sensitive thing an uploaded image carries, and harvesting it silently from every photograph is the kind of decision that gets made by accident when someone reaches for an EXIF library and the coordinates come along in the returned object.

Three things frame the choice:

- **POPS is single-user and self-hosted.** The data is the operator's own, on the operator's own hardware, behind Cloudflare Access. There is no second party this discloses anything to. That is not a reason the question does not arise — it is the reason the answer can be yes.
- **The repo's existing posture on EXIF is to strip it.** `pillars/inventory` and `pillars/food` re-encode uploaded images through `sharp`, and `libs/ui`'s `useImageProcessor` re-encodes through a canvas. All three drop EXIF, incidentally rather than as a stated position, and none of them holds financial records. Nothing in the repo stated a position on storing location before this.
- **A standing rule already covers prompts.** Only merchant descriptions reach the Anthropic API; never account or card numbers. Coordinates are on the same side of that line, and nothing about deciding to _store_ location changes that.

## Options Considered

| Option                                                                         | Pros                                                                                                                                 | Cons                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read capture time only; leave GPS unread                                       | No new sensitive data at rest. The uncontroversial half of the ticket ships on its own                                               | Discards the one spatial signal the system can get, and does so by silence rather than by decision — the next person to touch the reader has nothing telling them the omission was deliberate                                                           |
| Read GPS, but only into the response, never persisted                          | The reviewer sees it on the `needs-review` screen                                                                                    | A value that exists for one request and is then destroyed is the worst of both: it has been read off the image and it answers no question later. Nothing consumes a location that is not stored                                                         |
| Use a general EXIF library and store what looks useful                         | Less code; handles formats this reader does not                                                                                      | The library decides what the pillar learns about a person. Serial numbers, lens data, camera owner name and thumbnail images all arrive in the same object, and "we only read two fields off it" is a convention the next change drops without noticing |
| **Read GPS with a purpose-built reader and store it on the purchase (chosen)** | The spatial signal is available. What the pillar can learn from an image is a list of six tag numbers in one file. No new dependency | A hand-written binary parser over untrusted bytes, which has to be defensive and tested as such. And a coordinate at rest is a coordinate at rest                                                                                                       |

## Decision

**`purchases` reads the GPS tags from an uploaded receipt photograph and stores the resulting coordinate on the purchase.** Five constraints come with it.

1. **It is named for the capture, not for the purchase.** The columns are `capture_latitude` / `capture_longitude`, the wire fields are `captureLatitude` / `captureLongitude`, and the accessor is `captureLocation`. EXIF records where the _photograph_ was taken, and a receipt photographed at home a week later carries home's coordinate. A name like `purchase_location` would assert something the data cannot support, and every consumer would then treat it as though it could.

2. **The reader resolves an enumerated set of tags and no others.** `src/ingest/receipt/exif.ts` knows `DateTimeOriginal`, `OffsetTimeOriginal`, the two hemisphere references, the two angles, and the two sub-IFD pointers that reach them. Adding a seventh is a visible diff against this ADR rather than a library upgrade. This is the reason the reader is hand-written; it is not a performance argument and it is not a not-invented-here one.

3. **No coordinate reaches a model prompt.** The reading is resolved _after_ `readReceipt` returns and is handed only to the mapper. The vision interface takes parts and nothing else, so the separation is structural — and it is asserted anyway, in `src/api/__tests__/receipt-capture.test.ts`, because the way this leaks is somebody widening the struct the prompt is built from, and that change would pass every other test in the pillar. (The image bytes themselves go to the model and contain the EXIF block. That is the file, not a field the pillar extracted and forwarded.)

4. **A coordinate that is not a place is not stored.** Out of range, a hemisphere letter that is not one of the four, a rational with a zero denominator, and exactly `0, 0` — Null Island, where a device with no fix writes zeros — all resolve to no location. The bounds are restated as column `CHECK`s, so a value that got past the reader would be refused by the database rather than outliving whatever wrote it.

5. **It is derived from the image, not accepted from the client.** The upload body gained `capturedAt` and `timeZone` (POPS-1327) and deliberately gained no location field. A zone is what a date needs to be unambiguous and is the coarsest thing that answers that question; a coordinate is not needed to place a date, so the write surface does not accept one. A phone that has stripped its own EXIF therefore contributes no location — see POPS-2326.

The capture _time_ is ranked; the location is not. Nothing competes with it: the paper states no coordinate and the server has none, so either the photograph carried a believable fix or the purchase has no location. The time hierarchy is the receipt's printed date, then the client's `capturedAt`, then EXIF, then the upload instant, and it is documented in `src/ingest/receipt/capture.ts`.

## Consequences

- `purchases` holds location data for the first time. Its SQLite file is already replicated by Litestream (ADR-026) and its receipt images already sit beside it, so the backup and retention story does not change — but the sensitivity of that volume has gone up, and the operator's offsite encryption is now doing more work than it was.
- The `needs-review` and `unreadable` arms of the upload response carry no location, because they carry no purchase. A receipt whose figures did not reconcile keeps its photograph on disk, and the coordinate stays in the file rather than in a column, until a human settles it.
- Deleting a purchase deletes the coordinate; deleting the receipt image is a separate act, and the EXIF is still in the bytes on disk. Purging location therefore means purging images, not rows.
- Reading EXIF server-side means it works for any uploader, not only the app — but it works for _no_ uploader that re-encodes first, which includes the fleet's own web upload path. The location column will be null for everything except direct photograph uploads, and that is expected rather than a defect.
- The `timezone-uncertain` fallback is unchanged. An EXIF offset is an offset at one instant, not a zone, and applying it to a wall clock the receipt printed on another date would carry the wrong DST rule; the reader supplies it only to make the capture instant absolute.
