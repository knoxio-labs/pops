/**
 * HTTP-shaped domain errors used by inventory-api handlers.
 *
 * Each error carries an optional `messageKey` so the frontend can resolve a
 * translated string while the EN-AU fallback lives in `message`. The REST
 * error mapper carries `messageKey` into the response body (see
 * `../rest/error-mapping.ts`).
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
   * two the client ever sees: the envelope `mapHttpError` builds carries
   * `message` and `code`, and never `details`.
   *
   * Until POPS-3043 this class took `(details: unknown)` alone, so every 400 it
   * raised said `Validation failed` whatever the caller wrote — there was no
   * argument that could change it. Six pillars declared it that way and 22
   * call sites passed an explanation the client never saw; POPS-3037 fixed the
   * finance half, and POPS-3005 first found the shape.
   *
   * Do not give `message` a default: a default is exactly how the generic
   * string comes back by omission. Do not "tidy" the order back either —
   * `details: unknown` cannot refuse a string, so a swapped call compiles,
   * reads correctly, and returns a 400 body reading `Validation failed`.
   *
   * @param message What the client is shown. Required.
   * @param details Structured context for logs. It does NOT reach the client.
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
