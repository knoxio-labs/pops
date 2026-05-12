/**
 * Custom HTTP error classes.
 * Thrown from service/route layers, caught by the global error handler.
 *
 * Each error carries an optional `messageKey` so the frontend can look up the
 * translated string while the EN-AU fallback lives in `message`.
 */

import type { ErrorMessageKey } from './error-messages.js';

export class HttpError extends Error {
  /** i18n key the frontend uses to resolve a localised message. */
  public readonly messageKey?: ErrorMessageKey;

  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
    messageKey?: ErrorMessageKey
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
  constructor(details: unknown) {
    super(400, 'Validation failed', details, 'common.validationFailed');
    this.name = 'ValidationError';
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message, undefined, 'common.conflict');
    this.name = 'ConflictError';
  }
}

/**
 * Thrown by the inference middleware (PRD-092 US-04) when a pre-call budget
 * check finds an applicable rule with `action='block'` (or `action='fallback'`
 * with no viable local provider) whose current-month usage has reached or
 * exceeded the configured limit. The 402 Payment Required status is the
 * closest semantic match for "spending budget exhausted".
 */
export class BudgetExceededError extends HttpError {
  public readonly budgetId: string;
  public readonly limitType: 'cost' | 'token';
  public readonly currentUsage: number;
  public readonly limit: number;

  constructor(params: {
    budgetId: string;
    limitType: 'cost' | 'token';
    currentUsage: number;
    limit: number;
  }) {
    super(
      402,
      `Budget '${params.budgetId}' exceeded: ${params.limitType} usage ${params.currentUsage} >= limit ${params.limit}`,
      {
        budgetId: params.budgetId,
        limitType: params.limitType,
        currentUsage: params.currentUsage,
        limit: params.limit,
      }
    );
    this.name = 'BudgetExceededError';
    this.budgetId = params.budgetId;
    this.limitType = params.limitType;
    this.currentUsage = params.currentUsage;
    this.limit = params.limit;
  }
}
