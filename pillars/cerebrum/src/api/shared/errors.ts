import { defineErrors, PopsError } from '@pops/pillar-express';

/** Registered error metadata for the cerebrum REST and streaming surfaces. */
export const cerebrumErrors = defineErrors('cerebrum', {
  invalid: {
    area: 'request',
    status: 400,
    message: 'The request is invalid.',
    retryable: false,
  },
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
  gateway_unavailable: {
    area: 'ego',
    status: 503,
    message: 'The tool gateway is not configured.',
    retryable: true,
  },
  invalid_decision: {
    area: 'ego',
    status: 400,
    message: 'The decision must approve or reject every action in the batch exactly once.',
    retryable: false,
  },
  failure: {
    area: 'internal',
    status: 500,
    message: 'The service could not complete the request.',
    retryable: false,
  },
});

function codeForStatus(status: number): string {
  if (status === 400) return 'cerebrum.request.invalid';
  if (status === 404) return 'cerebrum.resource.not_found';
  if (status === 409) return 'cerebrum.resource.conflict';
  return 'cerebrum.internal.failure';
}

/** A cerebrum domain failure serialized by the shared ADR-054 middleware. */
export class HttpError extends PopsError {
  readonly statusCode: number;

  constructor(statusCode: number, message: string, _details?: unknown, _messageKey?: string) {
    super({ code: codeForStatus(statusCode), status: statusCode, message, retryable: false });
    this.statusCode = statusCode;
  }
}

/** A requested cerebrum resource does not exist. */
export class NotFoundError extends HttpError {
  constructor(resource: string, id: string) {
    super(404, `${resource} '${id}' not found`);
  }
}

/** A cerebrum request is structurally valid but invalid for the domain. */
export class ValidationError extends HttpError {
  constructor(message: string, details?: unknown, messageKey?: string) {
    super(400, message, details, messageKey);
  }
}

/** A cerebrum write conflicts with existing domain state. */
export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
  }
}
