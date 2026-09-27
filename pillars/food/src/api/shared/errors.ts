import { defineErrors, PopsError } from '@pops/pillar-express';

/** Registered domain failures emitted by the food REST handlers. */
export const foodDomainErrors = defineErrors('food', {
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
  failure: {
    area: 'internal',
    status: 500,
    message: 'The service could not complete the request.',
    retryable: false,
  },
});

function codeForStatus(status: number): string {
  if (status === 400) return 'food.request.invalid';
  if (status === 404) return 'food.resource.not_found';
  if (status === 409) return 'food.resource.conflict';
  return 'food.internal.failure';
}

/** A food domain failure serialized by the shared ADR-054 middleware. */
export class HttpError extends PopsError {
  readonly statusCode: number;

  constructor(statusCode: number, message: string, _details?: unknown, _messageKey?: string) {
    super({ code: codeForStatus(statusCode), status: statusCode, message, retryable: false });
    this.statusCode = statusCode;
  }
}

/** A requested food resource does not exist. */
export class NotFoundError extends HttpError {
  constructor(resource: string, id: string) {
    super(404, `${resource} '${id}' not found`);
  }
}

/** A food request is structurally valid but invalid for the domain. */
export class ValidationError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(400, message, details);
  }
}

/** A food write conflicts with existing domain state. */
export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
  }
}
