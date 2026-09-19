# Content-addressed media

A blob's identity is its SHA-256. `PUT /media/:sha256` verifies the claimed
hash against the uploaded bytes before writing anything, stores the original
under the images volume at `sha256[0:2]/sha256`, and derives two resized JPEG
variants (`thumb` 256px, `medium` 1024px) beside it. `GET /media/:sha256`
serves one of `full | thumb | medium` with a variant-scoped `ETag`. Re-sending
bytes that hash to an already-stored value is a no-op — the response says
`alreadyStored: true` and nothing is written again.

Both routes are raw Express, not ts-rest: this pillar's ts-rest routes carry
JSON bodies (uploads elsewhere in this pillar go through base64-in-JSON — see
`api/modules/photos/service.ts`), and a binary body with a size cap doesn't
fit that shape. They add no OpenAPI surface, the same way `api/files/router.ts`
doesn't.

## Who calls this

bfm's mobile-facing `PUT`/`GET /mobile/inventory/media/:sha256` proxies
straight through to these routes; the outcome vocabulary here (`alreadyStored`,
`hash_mismatch`, `413`, `415`, `media_not_found`) is what bfm forwards, not
reinterpreted at the proxy.

## The seam into `item.attachPhoto`

The command layer (`src/domain/commands/`) owns `item_photos` and decides
whether a mutation applies; this module owns `media` and the bytes on disk.
The two meet at one read: `mediaExists(db, sha256)`. Before `item.attachPhoto`
writes a reference to a hash, it must call `mediaExists` and reject the
mutation with `media_missing` (Inventory ADR-002 D9) if it answers `false` —
the upload-then-attach ordering the phone's drain depends on. Nothing in this
module reaches into `item_photos`; wiring that check into the command is the
command layer's job, not this one's.
