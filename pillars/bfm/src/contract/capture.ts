/**
 * What the handset knew that the receipt cannot state.
 *
 * The clock at the shutter, the zone the device was in, and where it was
 * standing. `purchases` accepts all three on its own upload route and records
 * them apart from the order row; this is bfm's mirror of that shape, and the
 * reasoning behind storing any of it — the location especially — is in
 * [ADR-047](../../../../docs/architecture/adr-047-purchases-stores-capture-location.md).
 *
 * ## Its own module
 *
 * Not because the file needed splitting, but because these two schemas are
 * the only sensitive thing this pillar's mobile surface accepts, and a
 * grep for what bfm does with a location should land on one small file rather
 * than on a line somewhere in the middle of every other mobile shape.
 *
 * ## Mirrored, not imported
 *
 * bfm may not depend on a sibling pillar's package, so the bounds here are a
 * copy of `purchases`' `CaptureLocationSchema` and `CaptureMetadataSchema`.
 * The copy is deliberate and it is why the numbers are restated rather than
 * loosened: a coordinate bfm accepts must not be one the producer will refuse,
 * because the cheaper refusal is the one that never leaves the handset. Drift
 * is survivable in that direction only, which is why every field is closed.
 *
 * ## Forwarded, never judged
 *
 * bfm decides nothing about these values beyond whether they are the shape it
 * promised to accept. Whether a capture time is believable is `purchases`'
 * call — it holds the upload instant the answer is measured against — and a
 * second rule here is the same mistake as the second dedup key ADR-046
 * forbids.
 */
import { z } from 'zod';

/**
 * Where the handset was standing when the shutter fired.
 *
 * WGS-84 signed decimal degrees, which is what `CLLocation` already hands the
 * app. Both halves required together: half a coordinate is not a place, and
 * accepting one would put a row in the producer's store that no map can draw.
 *
 * **It arrives in a `POST` body and nowhere else** — never a path segment,
 * never a query parameter, never echoed in a refusal. bfm's logging records a
 * route and a status rather than a body, and this route's `400` says the body
 * did not match the contract without saying what was in it.
 */
export const MobileCaptureLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type MobileCaptureLocation = z.infer<typeof MobileCaptureLocationSchema>;

/**
 * The block a handset may attach to a receipt upload.
 *
 * Every field optional and the whole object optional, so an app build that
 * predates this sends exactly what it sent before. That matters more here
 * than elsewhere in the fleet: the client is distributed rather than deployed
 * (ADR-043), so old versions keep calling this route from hardware nobody can
 * roll forward.
 */
export const MobileCaptureMetadataSchema = z.object({
  /**
   * ISO-8601 instant from the device clock, with an offset.
   *
   * The offset is not decoration — it states which offset the device was on,
   * which is itself evidence about where it was standing. A client that
   * normalises to `Z` still sends a correct instant and simply supplies no
   * such evidence.
   */
  capturedAt: z
    .string()
    .regex(
      /^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|([+-](?:[01]\d|2[0-3]):[0-5]\d)))$/
    )
    .optional(),
  /**
   * IANA zone the device was in — `Australia/Perth`, `Europe/Paris`.
   *
   * Not checked against this runtime. bfm and `purchases` are different
   * processes on different images, so a zone this one happens not to know is
   * a refusal the user cannot act on; the producer checks it against its own
   * runtime and falls through to the next-best evidence when it does not
   * resolve.
   */
  timeZone: z.string().trim().min(1).max(64).optional(),
  location: MobileCaptureLocationSchema.optional(),
});

export type MobileCaptureMetadata = z.infer<typeof MobileCaptureMetadataSchema>;
