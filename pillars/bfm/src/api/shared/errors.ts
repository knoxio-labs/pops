/**
 * HTTP-shaped domain errors for the bfm pillar's route handlers.
 *
 * The set is deliberately smaller than the registry's: this surface has no
 * 400/409 cases of its own, because every request body is validated by the
 * ts-rest contract before a handler runs.
 */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * The caller carries no operator principal.
 *
 * Deliberately opaque. bfm's own hostname has Cloudflare Access bypassed (the
 * device-facing surface needs it that way), so this response is reachable from
 * the public internet and must not describe what would have been accepted.
 */
export class UnauthorizedError extends HttpError {
  constructor(message = 'This endpoint requires a Cloudflare Access operator session.') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * The caller is a verified Cloudflare Access user who is not the operator.
 *
 * As opaque as {@link UnauthorizedError}, for the same reason: it says the
 * route is closed to this caller and nothing about who it is open to.
 */
export class ForbiddenError extends HttpError {
  constructor(message = 'This endpoint is not available to this account.') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends HttpError {
  constructor(resource: string, id: string) {
    super(404, `${resource} '${id}' not found`);
    this.name = 'NotFoundError';
  }
}

/**
 * Issuance was refused because the caller has already minted its allowance for
 * the current window. Carries the seconds until the window rolls, which the
 * handler surfaces as a `Retry-After` header.
 */
export class TooManyRequestsError extends HttpError {
  constructor(public readonly retryAfterSeconds: number) {
    super(429, 'Too many pairing codes requested. Try again shortly.');
    this.name = 'TooManyRequestsError';
  }
}
