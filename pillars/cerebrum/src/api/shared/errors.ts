/**
 * HTTP-shaped domain errors used by cerebrum's router handlers.
 *
 * Each error carries an optional `messageKey` so the frontend can look up the
 * translated string while the EN-AU fallback lives in `message`; the REST
 * error-mapping layer plumbs it through the wire error shape so clients
 * continue receiving `data.messageKey`.
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
   * `messageKey` (POPS-3051) comes last, after `details`, so the first two
   * parameters stay identical to the five sibling pillars' and to
   * {@link HttpError}'s own order. A caller wanting a key and no details
   * passes `undefined` between them — noisier at three call sites than a
   * reordering would be, and cheaper than six pillars whose `ValidationError`
   * takes its arguments in two different orders.
   *
   * @param message What a client with no i18n is shown. Required.
   * @param details Structured context for logs. It does NOT reach the client.
   * @param messageKey Key a client with i18n resolves instead. Defaults to the generic one.
   */
  constructor(message: string, details?: unknown, messageKey = 'common.validationFailed') {
    super(400, message, details, messageKey);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message, undefined, 'common.conflict');
    this.name = 'ConflictError';
  }
}
