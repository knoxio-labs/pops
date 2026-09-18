import type { ItemInsert } from '../../../db/index.js';

/** Legacy request fields whose `items` column has a different name. */
interface RenamedFields {
  location?: string | null;
  type?: string | null;
  assetId?: string | null;
  notes?: string | null;
}

/**
 * Copy the legacy request fields renamed by Inventory ADR-002 onto their
 * columns (`location` → `location_text`, `type` → `legacy_type`, `assetId` →
 * `code`, `notes` → `note`). Absent leaves the column alone; `null` clears it.
 * Returns whether any was written.
 */
export function assignRenamedColumns(target: Partial<ItemInsert>, input: RenamedFields): boolean {
  let touched = false;
  if (input.location !== undefined) {
    target.locationText = input.location;
    touched = true;
  }
  if (input.type !== undefined) {
    target.legacyType = input.type;
    touched = true;
  }
  if (input.assetId !== undefined) {
    target.code = input.assetId;
    touched = true;
  }
  if (input.notes !== undefined) {
    target.note = input.notes;
    touched = true;
  }
  return touched;
}
