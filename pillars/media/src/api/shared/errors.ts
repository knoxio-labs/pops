import { PopsError } from '@pops/pillar-express';

function codeForStatus(status: number): string {
  if (status === 400) return 'media.request.invalid';
  if (status === 404) return 'media.resource.not_found';
  if (status === 409) return 'media.resource.conflict';
  if (status === 502) return 'media.upstream.unavailable';
  return 'media.internal';
}

/** A media domain failure serialized by the shared ADR-054 middleware. */
export class HttpError extends PopsError {
  readonly statusCode: number;

  constructor(statusCode: number, message: string, _details?: unknown, _messageKey?: string) {
    super({
      code: codeForStatus(statusCode),
      status: statusCode,
      message,
      retryable: statusCode === 502,
    });
    this.statusCode = statusCode;
  }
}

/** A requested media resource does not exist. */
export class NotFoundError extends HttpError {
  constructor(resource: string, id: string) {
    super(404, `${resource} '${id}' not found`);
  }
}

/** A media request is structurally valid but invalid for the domain. */
export class ValidationError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(400, message, details);
  }
}

/** A media write conflicts with existing domain state. */
export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
  }
}

/** A retryable media metadata-provider failure. */
export class BadGatewayError extends HttpError {
  constructor(message: string) {
    super(502, message);
  }
}
