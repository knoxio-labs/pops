/**
 * HTTP-shaped domain errors used by finance-api REST handlers.
 *
 * Each error is a registered ADR-054 failure. Express's shared final handler
 * adds the current request ID and serializes the flat envelope.
 */
import { defineErrors, PopsError } from '@pops/pillar-express';

/** Registered finance domain failures used by REST handlers. */
export const financeDomainErrors = defineErrors('finance', {
  not_found: {
    area: 'resource',
    status: 404,
    message: 'The requested resource was not found.',
    retryable: false,
  },
  invalid: {
    area: 'request',
    status: 400,
    message: 'The request is invalid.',
    retryable: false,
  },
  conflict: {
    area: 'resource',
    status: 409,
    message: 'The request conflicts with existing state.',
    retryable: false,
  },
  unprocessable: {
    area: 'resource',
    status: 422,
    message: 'The request cannot be processed for this resource.',
    retryable: false,
  },
  precondition_failed: {
    area: 'request',
    status: 412,
    message: 'The request cannot be applied in the current state.',
    retryable: false,
  },
  forbidden: {
    area: 'resource',
    status: 403,
    message: 'The caller may see this resource but not do this to it.',
    retryable: false,
  },
});

interface HttpErrorOptions {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
  readonly retryable?: boolean;
}

/** Base finance HTTP failure serialized by the shared Express error handler. */
export class HttpError extends PopsError {
  public readonly statusCode: number;

  constructor(options: HttpErrorOptions) {
    super({
      code: options.code,
      status: options.statusCode,
      message: options.message,
      retryable: options.retryable ?? false,
      details: options.details,
    });
    this.statusCode = options.statusCode;
  }
}

/** A requested finance resource does not exist. */
export class NotFoundError extends HttpError {
  constructor(resource: string, id: string) {
    super({
      statusCode: 404,
      code: 'finance.resource.not_found',
      message: `${resource} '${id}' not found`,
    });
  }
}

/** A well-formed request violates a finance input rule. */
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
   * @param details Structured context included in the envelope when it is safe
   *   and useful to the caller.
   */
  constructor(message: string, details?: unknown) {
    super({ statusCode: 400, code: 'finance.request.invalid', message, details });
  }
}

/** A finance write conflicts with existing state. */
export class ConflictError extends HttpError {
  constructor(message: string) {
    super({ statusCode: 409, code: 'finance.resource.conflict', message });
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
  constructor(message: string) {
    super({ statusCode: 422, code: 'finance.resource.unprocessable', message });
  }
}

/**
 * 412 Precondition Failed — the targeted import session exists but is not in a
 * state the requested operation can act on (still processing, no result, or
 * the wrong result type).
 */
export class PreconditionError extends HttpError {
  constructor(message: string) {
    super({ statusCode: 412, code: 'finance.request.precondition_failed', message });
  }
}

/**
 * 403 Forbidden: the caller can see the resource but holds too low a role on
 * it for the operation. A resource the caller cannot see at all is a
 * {@link NotFoundError} instead, so its existence is not disclosed.
 */
export class ForbiddenError extends HttpError {
  constructor(message: string) {
    super({ statusCode: 403, code: 'finance.resource.forbidden', message });
  }
}
