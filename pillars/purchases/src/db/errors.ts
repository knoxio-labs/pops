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
