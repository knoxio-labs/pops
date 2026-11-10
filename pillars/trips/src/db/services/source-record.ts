/** Domain failures for owned records, ordering and grouping preconditions. */
export class TripsServiceError extends Error {
  constructor(
    readonly code:
      | 'meeting_revision_conflict'
      | 'meeting_revision_exhausted'
      | 'meeting_undo_conflict'
      | 'meeting_operation_mismatch'
      | 'meeting_contact_unknown'
      | 'meeting_contact_unavailable'
      | 'not_found'
      | 'order_invalid'
      | 'revision_conflict'
      | 'decision_revision_conflict'
      | 'option_not_removed'
      | 'journey_grouped'
      | 'parent_invalid'
      | 'tag_unknown'
      | 'tags_unavailable'
      | 'association_invalid'
      | 'association_exists'
  ) {
    super(code);
    this.name = 'TripsServiceError';
  }
}

/** Require an owned query result before projecting it through its source schema. */
export function requireOwnedRecord<T>(value: T | undefined): T {
  if (value === undefined) throw new TripsServiceError('not_found');
  return value;
}
