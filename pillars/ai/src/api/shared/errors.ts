/**
 * HTTP-shaped domain errors thrown by the REST handlers and translated into
 * the wire envelope by `mapHttpError` in `../rest/error-mapping.ts`.
 *
 * This pillar stands alone of every other pillar in the dependency graph, so
 * these errors are defined locally rather than shared.
 */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class NotFoundError extends HttpError {
  constructor(resource: string, id: string) {
    super(404, `${resource} '${id}' not found`);
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
    super(400, message, details);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
    this.name = 'ConflictError';
  }
}

/**
 * Caller is unauthenticated or carries a principal the route refuses.
 * Surfaces as a single 401 on the REST surface.
 */
export class UnauthorizedError extends HttpError {
  constructor(message: string) {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * A dependency this route needs is not configured, so the surface exists but
 * cannot answer. Job management raises it when the pillar has no Redis —
 * degraded, not broken, and distinctly not a 404.
 */
export class ServiceUnavailableError extends HttpError {
  constructor(message: string) {
    super(503, message);
    this.name = 'ServiceUnavailableError';
  }
}
