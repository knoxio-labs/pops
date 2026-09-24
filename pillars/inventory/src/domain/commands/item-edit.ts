import { z } from 'zod';

import { loadProtocol1Fields, resolveProtocol1TypeById } from '../../catalogue/index.js';
import {
  activeFieldPatchSchema,
  activePatchChanges,
  currentAuthoritativeFieldValues,
  mergeActiveFieldPatches,
} from './active-catalogue-values.js';
import { moveOntoReplacements } from './catalogue-replacement-move.js';
import {
  assertCommandFieldValues,
  resolveCommandCatalogue,
  resolveCommandType,
} from './command-catalogue.js';
import { requireItem, type FieldValues } from './entities.js';
import { CommandRejected } from './errors.js';
import { externalIdsSchema, normalizeNote } from './item-fields.js';
import { legacyItemPatchSchema } from './legacy-item-fields.js';
import { defineOp } from './op.js';
import { assertProtocol1Fields, protocol1FieldsAsJson } from './protocol-1-fields.js';
import { upsertSearchIndex } from './search-index.js';

import type { ItemFieldValueInput } from '../../catalogue/index.js';
import type { ActiveFieldPatch } from './active-catalogue-values.js';
import type { CommandCatalogueResolution } from './command-catalogue.js';
import type { CommandDb } from './entities.js';
import type { JsonValue } from './outcome.js';

/** `null` deletes the key on the merged blob; anything else sets it. */
const fieldsPatchSchema = z.record(z.string(), z.json().nullable());

const editArgs = z.object({
  name: z.string().trim().min(1).optional(),
  /**
   * `undefined` leaves the note untouched; empty or whitespace-only becomes
   * `null` rather than a 400, and anything else is kept exactly as sent
   * (POPS-4053).
   */
  note: z
    .string()
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : normalizeNote(value))),
  fields: fieldsPatchSchema.optional(),
  values: z.array(activeFieldPatchSchema).optional(),
  externalIds: externalIdsSchema.optional(),
  /**
   * A patch over the legacy provenance and value columns (POPS-4053): the
   * new model has no field for these, so the legacy `/items` routes send
   * them here rather than through `fields`, which is validated against a
   * type's catalogue.
   */
  legacy: legacyItemPatchSchema.optional(),
});
type EditArgs = z.infer<typeof editArgs>;

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
  db: CommandDb,
  row: { readonly id: string; readonly typeId: string | null },
  patch: Record<string, JsonValue | null> | undefined
): Record<string, JsonValue> {
  const current = protocol1FieldsAsJson(loadProtocol1Fields(db, row.id));
  if (patch === undefined) return current;
  const next = mergeFieldsPatch(current, patch);
  const type = row.typeId ? resolveProtocol1TypeById(db, row.typeId) : undefined;
  if (row.typeId !== null && type === null) {
    throw new CommandRejected('type_unknown', `unknown type ${row.typeId}`);
  }
  if (type) {
    assertProtocol1Fields(db, type.id, next);
  } else if (Object.keys(next).length > 0) {
    throw new CommandRejected('invalid', 'an untyped item cannot carry fields');
  }
  return next;
}

function resolveNextActiveValues(
  db: CommandDb,
  row: { readonly id: string; readonly typeId: string | null },
  resolution: CommandCatalogueResolution,
  patches:
    | {
        readonly authored: readonly ActiveFieldPatch[];
        readonly moved: readonly ActiveFieldPatch[];
      }
    | undefined
): ItemFieldValueInput[] {
  const type = row.typeId === null ? null : resolveCommandType(resolution, row.typeId).active;
  const current = currentAuthoritativeFieldValues(db, row.id);
  if (patches === undefined) return current;
  if (type === null) {
    if (patches.authored.some((patch) => patch.values !== null)) {
      throw new CommandRejected('invalid', 'an untyped item cannot carry values');
    }
    return [];
  }
  const authored = mergeActiveFieldPatches(current, patches.authored);
  const values = mergeActiveFieldPatches(current, patches.moved);
  assertCommandFieldValues(
    db,
    resolution,
    { typeId: type.id, values: authored, existingItemId: row.id },
    { typeId: type.id, values, existingItemId: row.id }
  );
  return values;
}

function catalogueEditChanges(
  db: CommandDb,
  row: { readonly id: string; readonly typeId: string | null },
  args: EditArgs,
  catalogueRevision: number | undefined
): FieldValues {
  if (catalogueRevision === undefined) {
    if (args.values !== undefined) {
      throw new CommandRejected('invalid', 'stable values require catalogueRevision');
    }
    if (args.fields === undefined) return {};
    return { fields: resolveNextFields(db, row, args.fields) };
  }
  if (args.fields !== undefined) {
    throw new CommandRejected('invalid', 'named fields are only supported by protocol 1');
  }
  const resolution = resolveCommandCatalogue(db, catalogueRevision);
  const patches =
    args.values === undefined
      ? undefined
      : {
          authored: args.values,
          moved: moveOntoReplacements(resolution, {
            typeId: null,
            itemTypeId: row.typeId,
            values: args.values,
          }).values,
        };
  resolveNextActiveValues(db, row, resolution, patches);
  return patches === undefined ? {} : activePatchChanges(patches.moved);
}

/**
 * `item.edit { name?, note?, values?, externalIds?, legacy? }`: change the
 * fields a type does not own. Protocol 2 `values` patches stable field IDs;
 * `null` clears an optional stored value and omissions remain unchanged.
 * Protocol 1 `fields` is the equivalent named-key patch. The complete merged
 * result is validated against the selected catalogue revision. `legacy` is a flat patch over the
 * provenance and value columns the legacy `/items` routes still expose
 * (POPS-4053) — every key it carries is applied field-by-field through the
 * engine's own conflict check, exactly like `name` or `note`. Omitted
 * arguments are left as they are.
 */
export const itemEdit = defineOp({
  op: 'item.edit',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'base',
  args: editArgs,
  plan(ctx, target, args) {
    const row = requireItem(target);
    const nextName = args.name ?? row.name;
    const nextNote = args.note !== undefined ? args.note : row.note;
    const nextExternalIds = args.externalIds ?? (JSON.parse(row.externalIds) as JsonValue);
    const changes = catalogueEditChanges(ctx.db, row, args, ctx.mutation.catalogueRevision);
    if (args.name !== undefined) changes['name'] = args.name;
    if (args.note !== undefined) changes['note'] = args.note;
    if (args.externalIds !== undefined) changes['externalIds'] = args.externalIds;
    if (args.legacy !== undefined) {
      for (const [field, value] of Object.entries(args.legacy)) {
        if (value !== undefined) changes[field] = value as JsonValue;
      }
    }

    return {
      eventKind: 'edited',
      changes,
      effects(ctx) {
        upsertSearchIndex(ctx.db, {
          id: row.id,
          name: nextName,
          code: row.code,
          note: nextNote,
          typeId: row.typeId,
          externalIds: JSON.stringify(nextExternalIds),
        });
      },
    };
  },
});
