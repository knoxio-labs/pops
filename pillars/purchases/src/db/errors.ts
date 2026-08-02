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

/**
 * Raised when an ingest attempts to write a purchase whose `checksum`
 * already exists. Callers treat this as a no-op rather than a failure —
 * re-ingesting the same export bundle must be idempotent.
 */
export class DuplicatePurchaseError extends Error {
  readonly checksum: string;

  constructor(checksum: string) {
    super(`A purchase with checksum ${checksum} already exists`);
    this.name = 'DuplicatePurchaseError';
    this.checksum = checksum;
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
