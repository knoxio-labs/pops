import { randomUUID } from 'node:crypto';

import { openTripsDb } from '../index.js';
import {
  CAPTURE_COMMANDS,
  IDEA_COMMANDS,
  EXPLORE_COMMANDS,
  operateSourceWorkspace,
} from '../services/source-operations.js';

import type { SourceCommand, SourceOperationResult } from '../../contract/source-workspace.js';
import type { TripsDb } from '../index.js';

/** Isolate a synchronous source persistence assertion in a real migrated SQLite database. */
export function withCaptureDb(run: (db: TripsDb) => void): void {
  const opened = openTripsDb(':memory:');
  try {
    run(opened.db);
  } finally {
    opened.raw.close();
  }
}
/** Exercise the production operation engine with explicit source scopes and stable retry identifiers. */
export function send(
  db: TripsDb,
  tripId: number,
  command: SourceCommand,
  operationId: string = randomUUID()
): SourceOperationResult {
  return operateSourceWorkspace(db, tripId, { operationId, command }, [
    ...CAPTURE_COMMANDS,
    ...IDEA_COMMANDS,
    ...EXPLORE_COMMANDS,
  ]);
}
