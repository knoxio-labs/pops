/**
 * HTTP-shaped domain errors used by finance-api REST handlers.
 *
 * Each error carries an optional `messageKey` the frontend uses to resolve a
 * translated string, with the EN-AU fallback in `message`. The REST error
 * mapping plumbs `messageKey` through the wire error shape so clients receive
 * it as `data.messageKey`.
 */
export class HttpError extends Error {
  /** i18n key the frontend uses to resolve a localised message. */
  public readonly messageKey?: string;

  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
    messageKey?: string
  ) {
    super(message);
    this.name = 'HttpError';
    this.messageKey = messageKey;
  }
}

export class NotFoundError extends HttpError {
  constructor(resource: string, id: string) {
    super(404, `${resource} '${id}' not found`, undefined, 'common.notFound');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends HttpError {
  /**
   * `message` comes first, and is required, because it is the only one of the
   * two the client ever sees.
   *
   * The reverse order — `(details, message = 'Validation failed')` — is what
   * this class had until POPS-3037, and eleven sites got it wrong (POPS-3005):
   * `throw new ValidationError('Pattern is not a valid regular expression')`
   * compiles, reads correctly, and returns a 400 whose body says
   * `Validation failed`, because `details: unknown` cannot refuse a string.
   * Three of them were handler translators that had already pulled
   * `err.message` off the domain error and then put it in the discarded slot.
   * Do not "tidy" the order back.
   *
   * @param message What the client is shown. Required — there is no generic
   *   default, so a caller cannot get one by omission.
   * @param details Structured context for logs. It does NOT reach the client —
   *   the wire envelope carries `message`, `code` and `messageKey` only.
   */
  constructor(message: string, details?: unknown) {
    super(400, message, details, 'common.validationFailed');
    this.name = 'ValidationError';
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message, undefined, 'common.conflict');
    this.name = 'ConflictError';
  }
}

/**
 * 422 Unprocessable Entity — the request is well-formed and passes schema
 * validation, but names something the domain refuses to act on: an account
 * `kind` reserved for future use (`ReservedAccountKindError`), or an
 * operation that's semantically invalid for the resource it targets (e.g.
 * writing gift-card details onto an account that isn't `kind: 'gift-card'`).
 */
export class UnprocessableEntityError extends HttpError {
  constructor(message: string, messageKey = 'common.unprocessable') {
    super(422, message, undefined, messageKey);
    this.name = 'UnprocessableEntityError';
  }
}

/**
 * 412 Precondition Failed — the targeted import session exists but is not in a
 * state the requested operation can act on (still processing, no result, or
 * the wrong result type).
 */
export class PreconditionError extends HttpError {
  constructor(message: string, messageKey?: string) {
    super(412, message, undefined, messageKey);
    this.name = 'PreconditionError';
  }
}
