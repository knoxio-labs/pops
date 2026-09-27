import { PopsError } from '@pops/pillar-express';

/**
 * A request the sync protocol refuses, carrying the status and registered
 * dotted code serialized by the shared Express error pipeline.
 */
export class SyncRequestError extends PopsError {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 426 | 503,
    reason: string,
    message: string
  ) {
    super({
      code: `inventory.sync.${reason}`,
      status,
      message,
      retryable: status === 503,
    });
  }
}

/** A ledger report sent by anything other than a device actor. */
export function deviceActorRequired(): SyncRequestError {
  return new SyncRequestError(
    403,
    'device_actor_required',
    'A ledger report must come from a device'
  );
}

/** A cursor this server did not issue, or one issued for another route or item. */
export function invalidCursor(): SyncRequestError {
  return new SyncRequestError(400, 'invalid_cursor', 'The cursor was not issued by this server');
}

/** The client's view cannot be continued: take a fresh snapshot, keeping queued mutations. */
export function resyncRequired(reason: string): SyncRequestError {
  return new SyncRequestError(409, 'resync_required', reason);
}
