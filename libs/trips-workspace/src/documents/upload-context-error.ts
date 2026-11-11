/** Host configuration error: a retained upload cannot be rebound to another target or owner. */
export class TripDocumentUploadContextError extends Error {
  readonly code = 'trips.document.upload_context_mismatch';

  constructor() {
    super('The trip, item or document connection changed for this upload.');
    this.name = 'TripDocumentUploadContextError';
  }
}
