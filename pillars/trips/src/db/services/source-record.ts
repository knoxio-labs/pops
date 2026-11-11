/** Domain failures for owned records, ordering and grouping preconditions. */
export class TripsServiceError extends Error {
  constructor(
    readonly code:
      | 'route_revision_conflict'
      | 'route_membership_conflict'
      | 'route_operation_mismatch'
      | 'route_undo_conflict'
      | 'meeting_revision_conflict'
      | 'meeting_revision_exhausted'
      | 'meeting_undo_conflict'
      | 'meeting_operation_mismatch'
      | 'meeting_contact_unknown'
      | 'meeting_contact_unavailable'
      | 'not_found'
      | 'leg_revision_conflict'
      | 'leg_order_conflict'
      | 'leg_removal_conflict'
      | 'order_invalid'
      | 'revision_conflict'
      | 'visit_revision_conflict'
      | 'visit_revision_exhausted'
      | 'arrangement_revision_conflict'
      | 'contact_unknown'
      | 'contacts_unavailable'
      | 'decision_revision_conflict'
      | 'option_not_removed'
      | 'journey_grouped'
      | 'parent_invalid'
      | 'tag_unknown'
      | 'tags_unavailable'
      | 'association_invalid'
      | 'association_exists'
      | 'source_revision_conflict'
      | 'source_operation_mismatch'
      | 'source_undo_conflict'
      | 'source_target_invalid'
      | 'source_referenced'
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
