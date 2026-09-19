/**
 * Wire shapes for `/mobile/inventory/media/:sha256` — bfm's relay of the
 * inventory pillar's content-addressed media store: raw Express
 * `PUT`/`GET /media/:sha256`, not part of inventory's own ts-rest contract.
 *
 * That store is raw Express, not ts-rest (bytes and a size cap do not fit a
 * JSON contract), so it publishes no OpenAPI operation bfm could call through
 * `pillar()`. The mobile wire stays base64-in-JSON, the same shape bfm's own
 * receipt capture upload already uses (`contract/receipt.ts`'s
 * `MobileReceiptPartSchema`), because that is what lets this route live in
 * `bfmContract` and be gated by {@link requires} like every other mobile
 * route; the leg that changes shape is the one BEHIND bfm — `api/inventory/
 * media-client.ts` speaks raw bytes to inventory's raw route, never through
 * `pillar()`.
 *
 * `MOBILE_INVENTORY_MEDIA_TYPES` mirrors inventory's own
 * `ALLOWED_UPLOAD_CONTENT_TYPES` rather than importing it — bfm has no
 * build-time dependency on the inventory pillar (see this file's sibling,
 * `mobile-inventory-schemas.ts`, for the same reasoning applied to the sync
 * wire). A type inventory drops is refused here as bfm's own `400`; a type
 * inventory adds is simply not offered on the wire yet.
 */
import { z } from 'zod';

/** Mirrors inventory's `ALLOWED_UPLOAD_CONTENT_TYPES` (`api/media/router.ts`). */
export const MOBILE_INVENTORY_MEDIA_TYPES = ['image/jpeg', 'image/heic'] as const;

export const MobileInventoryMediaTypeSchema = z.enum(MOBILE_INVENTORY_MEDIA_TYPES);

export type MobileInventoryMediaType = z.infer<typeof MobileInventoryMediaTypeSchema>;

/**
 * The variant a `GET` may ask for. Mirrors inventory's own
 * `isMediaVariant` vocabulary (`api/media/variants.ts`).
 */
export const MOBILE_INVENTORY_MEDIA_VARIANTS = ['full', 'thumb', 'medium'] as const;

export const MobileInventoryMediaVariantSchema = z.enum(MOBILE_INVENTORY_MEDIA_VARIANTS);

export type MobileInventoryMediaVariant = z.infer<typeof MobileInventoryMediaVariantSchema>;

/**
 * `PUT` body: the file, base64 with no data-URI prefix — the same encoding
 * `MobileReceiptPartSchema` uses for the same reason.
 */
export const MobileInventoryMediaUploadBodySchema = z.object({
  mediaType: MobileInventoryMediaTypeSchema,
  dataBase64: z.string().min(1),
});

export type MobileInventoryMediaUploadBody = z.infer<typeof MobileInventoryMediaUploadBodySchema>;

/**
 * What a successful `PUT` answers. Mirrors inventory's own `StoreMediaResult`
 * field-for-field — `alreadyStored` is the one fact the app actually branches
 * on (whether to keep uploading or treat the reference as attachable now).
 */
export const MobileInventoryMediaStoredSchema = z.object({
  sha256: z.string(),
  alreadyStored: z.boolean(),
});

export type MobileInventoryMediaStored = z.infer<typeof MobileInventoryMediaStoredSchema>;

/** What a successful `GET` answers: the bytes, base64, with what they are. */
export const MobileInventoryMediaBytesSchema = z.object({
  sha256: z.string(),
  mediaType: z.string(),
  byteLength: z.int(),
  dataBase64: z.string(),
});

export type MobileInventoryMediaBytes = z.infer<typeof MobileInventoryMediaBytesSchema>;
