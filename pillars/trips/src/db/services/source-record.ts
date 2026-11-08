/** Domain failures for owned records, ordering and grouping preconditions. */
export class TripsServiceError extends Error {
  constructor(
    readonly code: 'not_found' | 'order_invalid' | 'revision_conflict' | 'journey_grouped'
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
