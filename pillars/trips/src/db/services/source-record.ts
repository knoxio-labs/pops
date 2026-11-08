/** A missing owned reference or invalid complete source-record permutation. */
export class TripsServiceError extends Error {
  constructor(readonly code: 'not_found' | 'order_invalid') {
    super(code);
    this.name = 'TripsServiceError';
  }
}

/** Require an owned query result before projecting it through its source schema. */
export function requireOwnedRecord<T>(value: T | undefined): T {
  if (value === undefined) throw new TripsServiceError('not_found');
  return value;
}
