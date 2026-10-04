/**
 * Atomic merge-or-insert keyed on `(listId, refKind, refId)`. `refKind`
 * cannot be `'free'` — `'free'` rows have no identity and so can't be
 * deduplicated.
 *
 * On conflict:
 *   - `'merge-additive'` (default): qty = existing.qty + new.qty (null = 0);
 *     notes = existing.notes ? `${existing.notes}\n${new.notes}` : new.notes;
 *     label replaced; unit kept.
 *   - `'replace'`: existing row's label/qty/unit/notes replaced wholesale.
 *   - `'skip'`: no-op; existing row left as-is.
 *
 * Notes-on-merge uses `\n` (newline) as the default separator and never
 * truncates. A caller can provide `notesMerge` to set another separator and
 * maximum length; truncation removes the oldest text first and prefixes `…`.
 */
import { and, eq } from 'drizzle-orm';

import { listItems, type ListItemRefKind, type ListItemRow } from '../schema.js';
import { expectRow, type ListsDb, nextPosition } from './internal.js';

/** Supported merge behavior when a reference already exists in a list. */
export type UpsertConflictMode = 'merge-additive' | 'replace' | 'skip';
/** Reference kinds that can identify an existing list item. */
export type UpsertRefKind = Exclude<ListItemRefKind, 'free'>;

/** Controls note formatting and the maximum Unicode code-point length on upsert. */
export interface NotesMergeOptions {
  /** Text between fragments; the default upsert behavior uses a newline. */
  separator: string;
  /** Maximum number of Unicode code points retained, including the truncation marker. */
  maxLength: number;
}

/** Input accepted by the atomic merge-or-insert operation. */
export interface UpsertItemByRefInput {
  listId: number;
  refKind: UpsertRefKind;
  refId: number;
  label: string;
  qty?: number | null;
  unit?: string | null;
  notes?: string | null;
  onConflict?: UpsertConflictMode;
  notesMerge?: NotesMergeOptions;
}

/** Result of inserting, merging, or skipping a referenced list item. */
export type UpsertOutcome =
  | { outcome: 'inserted'; itemId: number; position: number }
  | { outcome: 'merged'; itemId: number; qty: number | null }
  | { outcome: 'skipped'; itemId: number };

/** Atomically inserts or updates a referenced row and returns its final quantity after a merge. */
export function upsertItemByRef(db: ListsDb, input: UpsertItemByRefInput): UpsertOutcome {
  const mode: UpsertConflictMode = input.onConflict ?? 'merge-additive';
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(listItems)
      .where(
        and(
          eq(listItems.listId, input.listId),
          eq(listItems.refKind, input.refKind),
          eq(listItems.refId, input.refId)
        )
      )
      .limit(1)
      .all()[0];

    if (existing === undefined) {
      const position = nextPosition(tx, input.listId);
      const inserted = expectRow(
        tx
          .insert(listItems)
          .values({
            listId: input.listId,
            refKind: input.refKind,
            refId: input.refId,
            label: input.label,
            qty: input.qty ?? null,
            unit: input.unit ?? null,
            notes: writeNotes(input.notes ?? null, input.notesMerge),
            position,
          })
          .returning()
          .all(),
        'upsertItemByRef.insert'
      );
      return { outcome: 'inserted', itemId: inserted.id, position: inserted.position };
    }

    if (mode === 'skip') {
      return { outcome: 'skipped', itemId: existing.id };
    }

    const merged = mergedValues(existing, input, mode);
    tx.update(listItems).set(merged).where(eq(listItems.id, existing.id)).run();
    return { outcome: 'merged', itemId: existing.id, qty: merged.qty };
  });
}

interface MergedValues {
  label: string;
  qty: number | null;
  unit: string | null;
  notes: string | null;
}

function mergedValues(
  existing: ListItemRow,
  input: UpsertItemByRefInput,
  mode: 'merge-additive' | 'replace'
): MergedValues {
  if (mode === 'replace') return replacedValues(input);
  return additiveValues(existing, input);
}

function replacedValues(input: UpsertItemByRefInput): MergedValues {
  return {
    label: input.label,
    qty: input.qty ?? null,
    unit: input.unit ?? null,
    notes: writeNotes(input.notes ?? null, input.notesMerge),
  };
}

function additiveValues(existing: ListItemRow, input: UpsertItemByRefInput): MergedValues {
  return {
    label: input.label,
    qty: sumQuantity(existing.qty, input.qty ?? null),
    unit: existing.unit ?? input.unit ?? null,
    notes: mergeNotes(existing.notes, input.notes ?? null, input.notesMerge),
  };
}

function sumQuantity(existing: number | null, addition: number | null): number | null {
  if (existing === null && addition === null) return null;
  return (existing ?? 0) + (addition ?? 0);
}

function writeNotes(notes: string | null, options?: NotesMergeOptions): string | null {
  return options ? truncateNotes(notes, options) : notes;
}

function mergeNotes(
  existing: string | null,
  addition: string | null,
  options?: NotesMergeOptions
): string | null {
  if (addition === null || addition === '') {
    return options ? truncateNotes(existing, options) : existing;
  }
  const merged =
    existing === null || existing === ''
      ? addition
      : `${existing}${options?.separator ?? '\n'}${addition}`;
  return options ? truncateNotes(merged, options) : merged;
}

function truncateNotes(notes: string | null, options: NotesMergeOptions): string | null {
  if (notes === null) return null;
  const characters = Array.from(notes);
  if (characters.length <= options.maxLength) return notes;
  if (options.maxLength === 1) return '…';

  let retained = characters.slice(-(options.maxLength - 1)).join('');
  const configuredSeparatorIndex =
    options.separator === '' ? -1 : retained.indexOf(options.separator);
  const newlineIndex = retained.indexOf('\n');
  if (
    configuredSeparatorIndex >= 0 &&
    (newlineIndex < 0 || configuredSeparatorIndex <= newlineIndex)
  ) {
    retained = retained.slice(configuredSeparatorIndex + options.separator.length);
  } else if (newlineIndex >= 0) {
    retained = retained.slice(newlineIndex + 1);
  }
  return `…${retained}`;
}
