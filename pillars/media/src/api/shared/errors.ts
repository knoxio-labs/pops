import { defineErrors, PopsError } from '@pops/pillar-express';

/** Registered domain failures emitted by the media REST handlers. */
export const mediaDomainErrors = defineErrors('media', {
  not_found: {
    area: 'resource',
    status: 404,
    message: 'The requested resource was not found.',
    retryable: false,
  },
  conflict: {
    area: 'resource',
    status: 409,
    message: 'The request conflicts with existing state.',
    retryable: false,
  },
  unavailable: {
    area: 'upstream',
    status: 502,
    message: 'The upstream service is unavailable.',
    retryable: true,
  },
  failure: {
    area: 'internal',
    status: 500,
    message: 'The service could not complete the request.',
    retryable: false,
  },
});

function codeForStatus(status: number): string {
  if (status === 400) return 'media.request.invalid';
  if (status === 404) return 'media.resource.not_found';
  if (status === 409) return 'media.resource.conflict';
  if (status === 502) return 'media.upstream.unavailable';
  return 'media.internal.failure';
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
