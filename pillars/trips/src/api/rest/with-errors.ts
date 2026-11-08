import { TripsServiceError } from '../../db/services/source-record.js';
import { tripsErrors } from '../errors.js';

/** Map owned domain failures to the pillar's stable HTTP error envelope. */
export async function withTripsErrors<T>(operation: () => T): Promise<T> {
  try {
    return operation();
  } catch (error) {
    if (error instanceof TripsServiceError) tripsErrors[error.code]();
    throw error;
  }
}
