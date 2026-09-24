import { replacingField, replacingType, sameFieldShape } from '../../catalogue/index.js';
import { fieldIn, typeIn } from './catalogue-change-reasons.js';

import type { PersistedItemType } from '../../catalogue/index.js';
import type { CommandCatalogueResolution } from './command-catalogue.js';

/** A value entry a command carries for one field; `null` values clear it. */
interface CarriedValue {
  readonly fieldId: string;
  readonly values: unknown;
}

/** What a command names, before or after {@link moveOntoReplacements}. */
export interface ReplacementSubject<T extends CarriedValue> {
  /** The type a create or type change names; null for an edit. */
  readonly typeId: string | null;
  readonly values: readonly T[];
}

function newlyArchived(
  authored: { readonly archivedAt: string | null } | undefined,
  active: { readonly archivedAt: string | null } | undefined
): boolean {
  return authored?.archivedAt === null && active !== undefined && active.archivedAt !== null;
}

function replacementType(
  resolution: CommandCatalogueResolution,
  typeId: string | null
): PersistedItemType | null {
  if (typeId === null) return null;
  const { authored, active } = resolution;
  if (!newlyArchived(typeIn(authored, typeId), typeIn(active, typeId))) return null;
  return replacingType(active, typeId);
}

function movedValues<T extends CarriedValue>(
  resolution: CommandCatalogueResolution,
  values: readonly T[],
  landingTypeId: string | null
): T[] {
  const { authored, active } = resolution;
  const carried = new Set(values.map((entry) => entry.fieldId));
  return values.map((entry) => {
    const before = fieldIn(authored, entry.fieldId);
    if (entry.values === null || before === undefined) return entry;
    if (!newlyArchived(before, fieldIn(active, entry.fieldId))) return entry;
    const next = replacingField(active, entry.fieldId);
    if (
      next === null ||
      next.typeId !== landingTypeId ||
      carried.has(next.id) ||
      !sameFieldShape(before, next)
    ) {
      return entry;
    }
    carried.add(next.id);
    return { ...entry, fieldId: next.id };
  });
}

/**
 * A rebased command moved off the definitions archived since it was authored
 * and onto their recorded replacements, when a replacement accepts what the
 * command carries as it is (ADR-002, owner repair decision 3). This is the
 * server's half of the rule the phone's `CatalogueReplacement` applies:
 *
 * - a value moves onto the live replacement of its field when that field was
 *   live in the authored revision, the replacement belongs to the type the
 *   value lands on, has the same shape (`sameFieldShape`), and the command
 *   does not already carry it; a clear is never moved;
 * - a named type moves onto its live replacement when every value, after
 *   the field moves, lands on a stored live field of it; otherwise nothing
 *   moves and the refusal names the type.
 *
 * Whatever does not move is left as it was, so validation refuses it and the
 * `catalogue_repair_required` reason names the replacement.
 */
export function moveOntoReplacements<T extends CarriedValue>(
  resolution: CommandCatalogueResolution,
  subject: ReplacementSubject<T> & { readonly itemTypeId: string | null }
): ReplacementSubject<T> {
  const unchanged = { typeId: subject.typeId, values: [...subject.values] };
  if (!resolution.rebased) return unchanged;
  const type = replacementType(resolution, subject.typeId);
  const landing = type?.id ?? subject.typeId ?? subject.itemTypeId;
  const values = movedValues(resolution, subject.values, landing);
  if (type === null) return { typeId: subject.typeId, values };
  const stored = new Set(
    type.fields
      .filter((field) => field.storage === 'stored' && field.archivedAt === null)
      .map((field) => field.id)
  );
  if (!values.every((entry) => stored.has(entry.fieldId))) return unchanged;
  return { typeId: type.id, values };
}
