/**
 * A request the sync protocol refuses, carrying the status and machine `code`
 * the contract declares for it (`src/contract/rest-sync.ts`). Handlers turn it
 * into `{ status, body: { message, code } }`; anything else propagates.
 */
export class SyncRequestError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409 | 426 | 503,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'SyncRequestError';
  }
}

/** A cursor this server did not issue, or one issued for another route or item. */
export function invalidCursor(): SyncRequestError {
  return new SyncRequestError(400, 'invalid_cursor', 'The cursor was not issued by this server');
}

/** The client's view cannot be continued: take a fresh snapshot, keeping queued mutations. */
export function resyncRequired(reason: string): SyncRequestError {
  return new SyncRequestError(409, 'resync_required', reason);
}
