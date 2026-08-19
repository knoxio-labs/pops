/**
 * What an upload knew about its own capture, assembled for the mapper.
 *
 * Two sources meet here and neither is the model. The upload body may state
 * `capturedAt` and `timeZone`; the photograph's own bytes may state a capture
 * time and a coordinate. Both are claims about the *device*, and what they
 * are worth is decided in `ingest/receipt/capture.ts`, not here.
 *
 * **Nothing this returns reaches a prompt.** It is resolved after the vision
 * call, not before, and handed only to `receiptToPurchase`. A capture time, a
 * device zone and a coordinate are facts about a person rather than about the
 * receipt, and the pillar's rule is that only what the paper shows goes into
 * a prompt ([ADR-047](../../../../../docs/architecture/adr-047-purchases-stores-capture-location.md),
 * constraint 3). `ReceiptVision.read` takes parts and nothing else, so the
 * separation is structural — and `../__tests__/receipt-capture.test.ts`
 * asserts it anyway, because the way this leaks later is somebody widening
 * the struct the prompt is built from, and that change would pass every other
 * test in the pillar.
 */
import { NO_EXIF, readExif } from '../../ingest/receipt/exif.js';

import type { z } from 'zod';

import type { UploadReceiptBodySchema } from '../../contract/rest-receipts.js';
import type { ReceiptCapture } from '../../ingest/receipt/capture.js';
import type { ReceiptMediaType } from '../../ingest/receipt/vision.js';

type UploadBody = z.infer<typeof UploadReceiptBodySchema>;

/** A part as the handler holds it: canonicalised base64, still in memory. */
interface DecodablePart {
  readonly mediaType: ReceiptMediaType;
  readonly dataBase64: string;
}

/**
 * EXIF is read from the bytes in hand rather than back off disk: they are the
 * same bytes — the store is content-addressed — and a decode already paid for
 * is cheaper than a read.
 *
 * Only the first part that says anything is used. A long receipt is several
 * frames of one piece of paper taken seconds apart in one place, so a second
 * opinion is not worth the ambiguity of choosing between them.
 */
export function captureOf(body: UploadBody, parts: readonly DecodablePart[]): ReceiptCapture {
  const supplied = { capturedAt: body.capturedAt ?? null, timeZone: body.timeZone ?? null };
  for (const one of parts) {
    if (one.mediaType !== 'image/jpeg') continue;
    const exif = readExif(Buffer.from(one.dataBase64, 'base64'));
    if (exif.time !== null || exif.location !== null) return { ...supplied, exif };
  }
  return { ...supplied, exif: NO_EXIF };
}
