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

/**
 * An attach named a document the order already carries.
 *
 * Distinct from {@link DuplicatePurchaseError} because the caller is
 * attaching evidence to an order it did not create, and the two say different
 * things about what to do next: a duplicate order means skip the order, this
 * means the document is already where it was meant to go. A backfill re-run
 * lands here for everything it attached last time, which is what makes
 * running it twice a no-op rather than a second row.
 */
export class DocumentAlreadyAttachedError extends Error {
  readonly purchaseId: string;
  readonly documentUri: string;

  constructor(purchaseId: string, documentUri: string) {
    super(`Purchase ${purchaseId} already carries document ${documentUri}`);
    this.name = 'DocumentAlreadyAttachedError';
    this.purchaseId = purchaseId;
    this.documentUri = documentUri;
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
 * A product-dictionary edit named a product or a printed wording that is not
 * there.
 *
 * One error for both grains rather than two, because the caller's recovery is
 * the same in either case — re-read the dictionary, the row it was holding is
 * gone — and the message already says which grain it was.
 */
export class ProductDictionaryNotFoundError extends Error {
  /** The id that named nothing. */
  readonly ref: string;

  constructor(kind: 'product' | 'alias', ref: string) {
    super(kind === 'product' ? `Product '${ref}' not found` : `Product alias '${ref}' not found`);
    this.name = 'ProductDictionaryNotFoundError';
    this.ref = ref;
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

/**
 * An inventory proposal was answered that had already been answered — the
 * named unit is accepted or declined, or every unit of the line is.
 *
 * A conflict rather than a bad request, because the payload is fine and the
 * state is what refuses it. A double-submitted accept lands here instead of
 * putting a second asset in inventory for one physical thing, which is the
 * failure this state exists to prevent.
 */
export class InventoryProposalConflictError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(detail);
    this.name = 'InventoryProposalConflictError';
    this.detail = detail;
  }
}
