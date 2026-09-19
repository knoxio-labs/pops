import { z } from 'zod';

import { parseFieldValue as parse } from './item-fields.js';

import type { LocationInsert, LocationRow } from '../../db/row-types.js';
import type { FieldCodec } from './item-fields.js';

type LocationCodec = FieldCodec<LocationRow, LocationInsert>;

/**
 * Every location field the command layer can write, keyed by its wire name.
 * A place's position in the tree is the single field `parentId`, so a
 * concurrent move of the same place is compared as a whole.
 */
export const LOCATION_FIELD_CODECS: Readonly<Record<string, LocationCodec>> = {
  name: {
    read: (row) => row.name,
    columns: (value) => ({ name: parse(z.string().trim().min(1), 'name', value) }),
  },
  parentId: {
    read: (row) => row.parentId,
    columns: (value) => ({ parentId: parse(z.string().min(1).nullable(), 'parentId', value) }),
  },
  sortOrder: {
    read: (row) => row.sortOrder,
    columns: (value) => ({ sortOrder: parse(z.number().int(), 'sortOrder', value) }),
  },
  deletedAt: {
    read: (row) => row.deletedAt,
    columns: (value) => ({ deletedAt: parse(z.string().nullable(), 'deletedAt', value) }),
  },
};
