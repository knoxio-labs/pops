import { z } from 'zod';

import { findType, typeFieldsSchema } from '../../types/index.js';
import { requireItem, type FieldValues } from './entities.js';
import { CommandRejected } from './errors.js';
import { externalIdsSchema } from './item-fields.js';
import { defineOp } from './op.js';
import { upsertSearchIndex } from './search-index.js';

import type { JsonValue } from './outcome.js';

/** `null` deletes the key on the merged blob; anything else sets it. */
const fieldsPatchSchema = z.record(z.string(), z.json().nullable());

const editArgs = z.object({
  name: z.string().trim().min(1).optional(),
  note: z.string().trim().min(1).nullable().optional(),
  fields: fieldsPatchSchema.optional(),
  externalIds: externalIdsSchema.optional(),
});

/**
 * Merge a per-key patch into a stored `fields` blob: a `null` value removes
 * the key, anything else sets it. Exported for the vector generator, which
 * needs the same merge the op applies to build a matching "after".
 */
export function mergeFieldsPatch(
  current: Record<string, JsonValue>,
  patch: Record<string, JsonValue | null>
): Record<string, JsonValue> {
  const merged = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

/**
 * The item's `fields` blob after applying an optional patch, validated
 * against its type (or required empty, untyped). Unpatched, the stored
 * blob is returned as-is: it was valid when it was written.
 */
function resolveNextFields(
  row: { readonly typeKey: string | null; readonly fields: string },
  patch: Record<string, JsonValue | null> | undefined
): Record<string, JsonValue> {
  const current = JSON.parse(row.fields) as Record<string, JsonValue>;
  if (patch === undefined) return current;
  const next = mergeFieldsPatch(current, patch);
  const type = row.typeKey ? findType(row.typeKey) : undefined;
  if (type) {
    if (!typeFieldsSchema(type).safeParse(next).success) {
      throw new CommandRejected('invalid', `fields do not fit type ${type.key}`);
    }
  } else if (Object.keys(next).length > 0) {
    throw new CommandRejected('invalid', 'an untyped item cannot carry fields');
  }
  return next;
}

/**
 * `item.edit { name?, note?, fields?, externalIds? }`: change the fields a
 * type does not own. `fields` is a per-key patch over the stored blob, not a
 * replacement, so an edit never has to resend every value a form did not
 * touch; the merged result is still validated against the item's type (or
 * required empty, untyped). Omitted arguments are left as they are.
 */
export const itemEdit = defineOp({
  op: 'item.edit',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'base',
  args: editArgs,
  plan(_ctx, target, args) {
    const row = requireItem(target);
    const nextName = args.name ?? row.name;
    const nextNote = args.note !== undefined ? args.note : row.note;
    const nextExternalIds = args.externalIds ?? (JSON.parse(row.externalIds) as JsonValue);
    const nextFields = resolveNextFields(row, args.fields);

    const changes: FieldValues = {};
    if (args.name !== undefined) changes['name'] = args.name;
    if (args.note !== undefined) changes['note'] = args.note;
    if (args.externalIds !== undefined) changes['externalIds'] = args.externalIds;
    if (args.fields !== undefined) changes['fields'] = nextFields;

    return {
      eventKind: 'edited',
      changes,
      effects(ctx) {
        upsertSearchIndex(ctx.db, {
          id: row.id,
          name: nextName,
          code: row.code,
          note: nextNote,
          typeKey: row.typeKey,
          fields: JSON.stringify(nextFields),
          externalIds: JSON.stringify(nextExternalIds),
        });
      },
    };
  },
});
