import { PopsError } from '@pops/pillar-express';

function codeForStatus(status: number): string {
  if (status === 400) return 'cerebrum.request.invalid';
  if (status === 404) return 'cerebrum.resource.not_found';
  if (status === 409) return 'cerebrum.resource.conflict';
  return 'cerebrum.internal';
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
