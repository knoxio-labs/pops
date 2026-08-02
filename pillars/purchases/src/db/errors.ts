/**
 * Typed errors raised by the purchases service layer.
 *
 * Plain Error subclasses — the service layer doesn't know about HTTP. The
 * REST layer's error mapping (`api/rest/error-mapping.ts`) translates them
 * into the status surfaced to clients.
 */

export class PurchaseNotFoundError extends Error {
  readonly purchaseId: string;

  constructor(purchaseId: string) {
    super(`Purchase ${purchaseId} not found`);
    this.name = 'PurchaseNotFoundError';
    this.purchaseId = purchaseId;
  }
}

export class PurchaseSourceNotFoundError extends Error {
  readonly sourceId: string;

  constructor(sourceId: string) {
    super(`Purchase source '${sourceId}' not found`);
    this.name = 'PurchaseSourceNotFoundError';
    this.sourceId = sourceId;
  }
}

/** Which identity already claimed the order. See {@link DuplicatePurchaseError}. */
export type DuplicateMatch = 'checksum' | 'source-order-id';

/**
 * Raised when an ingest attempts to write an order that already exists.
 * Callers treat this as a no-op rather than a failure — re-ingesting the
 * same export bundle must be idempotent.
 *
 * Two identities can match, and both must raise this rather than only the
 * first. `checksum` catches a byte-identical re-upload; `source-order-id`
 * catches the same merchant order arriving under a *different* checksum,
 * which happens whenever an adapter changes how it hashes a row. Letting
 * the second fall through to the database's unique index would surface it
 * as a generic conflict, and an adapter branching on this error to skip
 * would treat its own idempotent re-run as a hard failure.
 */
export class DuplicatePurchaseError extends Error {
  /** The EXISTING row's checksum, which is not necessarily the one submitted. */
  readonly checksum: string;
  readonly matchedOn: DuplicateMatch;

  constructor(checksum: string, matchedOn: DuplicateMatch = 'checksum') {
    super(
      matchedOn === 'checksum'
        ? `A purchase with checksum ${checksum} already exists`
        : `That merchant order was already imported, under checksum ${checksum}`
    );
    this.name = 'DuplicatePurchaseError';
    this.checksum = checksum;
    this.matchedOn = matchedOn;
  }
}

/**
 * The ingest payload is internally inconsistent — a charge allocation names
 * an item ref the payload never defined, or two rows claim the same ref.
 *
 * A client mistake, not a server fault, so the REST layer maps it to 400.
 * An adapter that gets a 500 here has no way to tell "my payload is wrong"
 * from "the pillar is broken", and would reasonably retry forever.
 */
export class InvalidIngestPayloadError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(`Invalid ingest payload: ${detail}`);
    this.name = 'InvalidIngestPayloadError';
    this.detail = detail;
  }
}
