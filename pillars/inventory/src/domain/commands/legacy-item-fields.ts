/**
 * Field codecs for the legacy provenance and value columns of `items`
 * (`brand`, `model`, `purchaseDate`, `replacementValue`, and the rest of the
 * set `db/schema/items.ts` calls out as "carried unchanged from
 * `home_inventory` until the Phase D contraction migration"). The command
 * layer's own model has no field for these — they exist only so the legacy
 * `/items` routes (POPS-4053) can still edit them through `item.edit`
 * without a bespoke write path.
 *
 * Kept apart from `item-fields.ts` so that file stays legible as the new
 * model's own field set; `entities.ts` merges both maps into the one the
 * engine writes through.
 */
import { z } from 'zod';

import * as crossPillarUrisService from '../../db/services/cross-pillar-uris.js';
import { parseFieldValue, type FieldCodec } from './item-fields.js';

import type { ItemInsert, ItemRow } from '../../db/row-types.js';

type LegacyItemCodec = FieldCodec<ItemRow, ItemInsert>;

function nullableString(column: keyof ItemRow, wireField: string): LegacyItemCodec {
  return {
    read: (row) => row[column] as string | null,
    columns: (value) => ({
      [column]: parseFieldValue(z.string().nullable(), wireField, value),
    }),
  };
}

function nullableNumber(column: keyof ItemRow, wireField: string): LegacyItemCodec {
  return {
    read: (row) => row[column] as number | null,
    columns: (value) => ({
      [column]: parseFieldValue(z.number().nullable(), wireField, value),
    }),
  };
}

const inUseCodec: LegacyItemCodec = {
  read: (row) => (row.inUse === null ? null : row.inUse === 1),
  columns: (value) => ({
    inUse: (() => {
      const parsed = parseFieldValue(z.boolean().nullable(), 'inUse', value);
      return parsed === null ? null : Number(parsed);
    })(),
  }),
};

const deductibleCodec: LegacyItemCodec = {
  read: (row) => row.deductible === 1,
  columns: (value) => ({ deductible: Number(parseFieldValue(z.boolean(), 'deductible', value)) }),
};

const purchaseTransactionIdCodec: LegacyItemCodec = {
  read: (row) => row.purchaseTransactionId,
  columns: (value) => {
    const id = parseFieldValue(z.string().nullable(), 'purchaseTransactionId', value);
    return {
      purchaseTransactionId: id,
      purchaseTransactionUri: crossPillarUrisService.purchaseTransactionUriFor(id),
      purchaseTransactionStaleAt: null,
    };
  },
};

/**
 * Every legacy `items` field the command layer can write, keyed by the wire
 * name the legacy `/items` routes and their events use. Merged into
 * {@link ITEM_FIELD_CODECS} by `entities.ts`.
 */
export const LEGACY_ITEM_FIELD_CODECS: Readonly<Record<string, LegacyItemCodec>> = {
  brand: nullableString('brand', 'brand'),
  model: nullableString('model', 'model'),
  itemId: nullableString('itemId', 'itemId'),
  room: nullableString('room', 'room'),
  type: nullableString('legacyType', 'type'),
  location: nullableString('locationText', 'location'),
  condition: nullableString('condition', 'condition'),
  purchaseDate: nullableString('purchaseDate', 'purchaseDate'),
  warrantyExpires: nullableString('warrantyExpires', 'warrantyExpires'),
  purchasedFromId: nullableString('purchasedFromId', 'purchasedFromId'),
  purchasedFromName: nullableString('purchasedFromName', 'purchasedFromName'),
  replacementValue: nullableNumber('replacementValue', 'replacementValue'),
  resaleValue: nullableNumber('resaleValue', 'resaleValue'),
  purchasePrice: nullableNumber('purchasePrice', 'purchasePrice'),
  inUse: inUseCodec,
  deductible: deductibleCodec,
  purchaseTransactionId: purchaseTransactionIdCodec,
};

/** A patch over {@link LEGACY_ITEM_FIELD_CODECS}' fields, as `item.edit`'s legacy args accept it. */
export const legacyItemPatchSchema = z.object({
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  itemId: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  inUse: z.boolean().nullable().optional(),
  deductible: z.boolean().optional(),
  purchaseDate: z.string().nullable().optional(),
  warrantyExpires: z.string().nullable().optional(),
  replacementValue: z.number().nullable().optional(),
  resaleValue: z.number().nullable().optional(),
  purchasePrice: z.number().nullable().optional(),
  purchaseTransactionId: z.string().nullable().optional(),
  purchasedFromId: z.string().nullable().optional(),
  purchasedFromName: z.string().nullable().optional(),
});
/** A value of {@link legacyItemPatchSchema}. */
export type LegacyItemPatch = z.infer<typeof legacyItemPatchSchema>;
