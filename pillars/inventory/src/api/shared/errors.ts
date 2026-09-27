import { PopsError } from '@pops/pillar-express';

function codeForStatus(statusCode: number): string {
  if (statusCode === 404) return 'inventory.resource.not_found';
  if (statusCode === 409) return 'inventory.resource.conflict';
  return 'inventory.request.invalid';
}

/** HTTP-shaped domain error serialized by the shared ADR-054 handler. */
export class HttpError extends PopsError {
  /** i18n key the frontend uses to resolve a localised message. */
  public readonly messageKey?: string;

  constructor(
    public readonly statusCode: number,
    message: string,
    details?: unknown,
    messageKey?: string
  ) {
    super({
      code: codeForStatus(statusCode),
      status: statusCode,
      message,
      retryable: false,
      details: {
        ...(details === undefined ? {} : { context: details }),
        ...(messageKey === undefined ? {} : { messageKey }),
      },
    });
    this.messageKey = messageKey;
  }
}

export class NotFoundError extends HttpError {
  constructor(resource: string, id: string) {
    super(404, `${resource} '${id}' not found`, undefined, 'common.notFound');
  }
}

export class ValidationError extends HttpError {
  /**
   * `message` comes first and is required because it is the user-safe fallback.
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
   * @param details Structured context carried in the ADR-054 envelope.
   */
  constructor(message: string, details?: unknown) {
    super(400, message, details, 'common.validationFailed');
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message, undefined, 'common.conflict');
  }
}
