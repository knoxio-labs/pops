/**
 * How the scope gate says no: the rejection log and the ADR-054 response.
 *
 * Split from the gate so the decision and its rendering can each be read
 * whole.
 */
import { PopsError } from './errors.js';
import { sendPopsError } from './middleware.js';

import type { NextFunction, Request, Response } from 'express';

import type { ServiceAccountAuthResult } from '@pops/pillar-sdk/server';

/** Registered failures a service-account gate can throw into the final handler. */
export interface ServiceAccountErrorHandlers {
  readonly invalid: (details?: unknown) => never;
  readonly forbidden: (details?: unknown) => never;
  readonly unavailable: (details?: unknown) => never;
}

/**
 * Log a rejection with enough detail to act on — the account and the scope it
 * was missing — and never the key. A 403 is most often an account that needs
 * widening, and the operator cannot widen what the log does not name.
 *
 * The uncredentialled 401 gets its own wording. It is reachable only under
 * `requireCredential`, and it is the one rejection where no key was presented
 * at all — calling it a credentialled request would mis-tell the operator the
 * single fact that distinguishes it from a bad key.
 */
export function logRejection(logPrefix: string, result: ServiceAccountAuthResult): void {
  if (result.reason === 'missing-scope') {
    console.warn(
      `[${logPrefix}] service account '${result.principal?.name ?? 'unknown'}' is not authorised ` +
        `for '${result.requiredScope ?? 'unknown'}'`
    );
    return;
  }
  const subject =
    result.reason === 'no-credential'
      ? 'an uncredentialled request'
      : `a credentialled request (${result.reason})`;
  console.warn(`[${logPrefix}] rejected ${subject} for '${result.requiredScope ?? 'unknown'}'`);
}

/** A refusal the gate decided on: the status to send and what to tell the caller. */
export interface AuthFailure {
  readonly status: number;
  readonly details?: unknown;
}

interface SendAuthFailureOptions {
  readonly options: {
    readonly rootScope: string;
    readonly errors?: ServiceAccountErrorHandlers;
  };
  readonly failure: AuthFailure;
  readonly req: Request;
  readonly res: Response;
  readonly next: NextFunction;
}

export function sendAuthFailure({
  options,
  failure,
  req,
  res,
  next,
}: SendAuthFailureOptions): void {
  const { status, details } = failure;
  // A malformed delegated subject has no registered handler: the three a
  // pillar registers are ADR-044's, and this one is the gate's own.
  if (options.errors !== undefined && status !== 400) {
    try {
      if (status === 401) options.errors.invalid(details);
      if (status === 403) options.errors.forbidden(details);
      if (status === 503) options.errors.unavailable(details);
      throw new Error(`Unexpected service-account rejection status: ${status}`);
    } catch (error) {
      next(error);
    }
    return;
  }

  sendPopsError(req, res, authFailure(options.rootScope, status, details));
}

function authFailure(rootScope: string, status: number, details?: unknown): PopsError {
  if (status === 400) {
    return new PopsError({
      code: `${rootScope}.auth.subject_invalid`,
      status,
      message: 'The delegated subject is not a valid email address.',
      retryable: false,
      details,
    });
  }
  if (status === 401) {
    return new PopsError({
      code: `${rootScope}.auth.invalid`,
      status,
      message: 'Missing or invalid service-account credentials.',
      retryable: false,
      details,
    });
  }
  if (status === 403) {
    return new PopsError({
      code: `${rootScope}.auth.forbidden`,
      status,
      message: 'This service account is not authorised for this operation.',
      retryable: false,
      details,
    });
  }
  if (status === 503) {
    return new PopsError({
      code: `${rootScope}.auth.unavailable`,
      status,
      message: 'Service-account credentials could not be verified.',
      retryable: true,
      details,
    });
  }
  throw new Error(`Unexpected service-account rejection status: ${status}`);
}
