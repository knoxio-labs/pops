import type { SourceReceipt } from '../../contract/source-workspace.js';
import type { TripsDb } from '../index.js';
import type { SourceInverse } from './source-inverse-types.js';

/** Mutation-owned rows and preconditions accumulated inside a single immediate transaction. */
export interface SourceWrite {
  db: TripsDb;
  tripId: number;
  receipt: SourceReceipt;
  inverse: SourceInverse;
}
