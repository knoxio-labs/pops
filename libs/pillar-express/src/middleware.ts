import { RequestValidationError } from '@ts-rest/express';

import {
  getRequestId,
  mintRequestId,
  REQUEST_ID_HEADER,
  runWithRequestId,
} from '@pops/pillar-sdk/server';

import { PopsError } from './errors.js';

import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';

import type { ErrorBody } from '@pops/types';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export interface ErrorHandlerLogger {
  readonly error: (...values: unknown[]) => void;
}

export interface ErrorMiddlewareOptions {
  readonly pillar: string;
  readonly logger?: ErrorHandlerLogger;
}

export interface ErrorHandlers {
  readonly requestId: RequestHandler;
  readonly bodyParser: ErrorRequestHandler;
  readonly validation: ErrorRequestHandler;
  readonly notFound: RequestHandler;
  readonly final: ErrorRequestHandler;
}

/** Install request-ID propagation and async context for an Express app. */
export function createRequestIdMiddleware(): RequestHandler {
  return (req, res, next): void => {
    const requestId = req.get(REQUEST_ID_HEADER) || mintRequestId();
    req.requestId = requestId;
    res.locals.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    runWithRequestId(requestId, next);
  };
}

/** Convert ts-rest request validation failures to the shared envelope. */
export function createRequestValidationErrorHandler(
  options: ErrorMiddlewareOptions
): ErrorRequestHandler {
  return (error: unknown, req, res, next): void => {
    if (!(error instanceof RequestValidationError)) {
      next(error);
      return;
    }
    sendPopsError(
      req,
      res,
      new PopsError({
        code: `${options.pillar}.request.invalid`,
        status: 400,
        message: 'The request is invalid.',
        retryable: false,
        details: { issues: validationIssues(error) },
      })
    );
  };
}

/** Convert body-parser failures, including oversized JSON bodies, to JSON. */
export function createBodyParserErrorHandler(options: ErrorMiddlewareOptions): ErrorRequestHandler {
  return (error: unknown, req, res, next): void => {
    if (!isBodyParserError(error)) {
      next(error);
      return;
    }
    const tooLarge = error.status === 413 || error.type === 'entity.too.large';
    sendPopsError(
      req,
      res,
      new PopsError({
        code: tooLarge
          ? `${options.pillar}.request.body_too_large`
          : `${options.pillar}.request.invalid`,
        status: tooLarge ? 413 : normalizeClientErrorStatus(error.status),
        message: tooLarge ? 'The request body is too large.' : 'The request body is invalid.',
        retryable: false,
      })
    );
  };
}

/** Return the shared JSON envelope for an unmatched route. */
export function createUnmatchedRouteHandler(options: ErrorMiddlewareOptions): RequestHandler {
  return (req, res, next): void => {
    if (req.method === 'OPTIONS' || res.headersSent) {
      next();
      return;
    }
    sendPopsError(
      req,
      res,
      new PopsError({
        code: `${options.pillar}.route.not_found`,
        status: 404,
        message: 'The requested route was not found.',
        retryable: false,
      })
    );
  };
}

/** Serialize known failures and hide implementation details for unknown ones. */
export function createPopsErrorHandler(options: ErrorMiddlewareOptions): ErrorRequestHandler {
  const logger = options.logger ?? console;
  return (error: unknown, req, res, _next): void => {
    if (res.headersSent) return;
    const requestId = ensureRequestId(req, res);
    if (error instanceof PopsError) {
      sendPopsError(req, res, error);
      return;
    }
    logger.error(`[${options.pillar}] unhandled request failure`, { requestId, error });
    sendPopsError(
      req,
      res,
      new PopsError({
        code: `${options.pillar}.internal`,
        status: 500,
        message: 'The service could not complete the request.',
        retryable: false,
      })
    );
  };
}

/** Build the complete middleware set in the order an Express app should mount it. */
export function createPillarErrorHandlers(options: ErrorMiddlewareOptions): ErrorHandlers {
  return {
    requestId: createRequestIdMiddleware(),
    bodyParser: createBodyParserErrorHandler(options),
    validation: createRequestValidationErrorHandler(options),
    notFound: createUnmatchedRouteHandler(options),
    final: createPopsErrorHandler(options),
  };
}

function sendPopsError(req: Request, res: Response, error: PopsError): void {
  if (res.headersSent) return;
  const requestId = ensureRequestId(req, res);
  const body: ErrorBody = {
    code: error.code,
    message: error.message,
    requestId,
    retryable: error.retryable,
    ...(error.details === undefined ? {} : { details: error.details }),
  };
  res.status(error.status).json(body);
}

function ensureRequestId(req: Request, res: Response): string {
  const requestId =
    req.requestId ?? res.locals.requestId ?? req.get(REQUEST_ID_HEADER) ?? getRequestId();
  const resolved = requestId || mintRequestId();
  req.requestId = resolved;
  res.locals.requestId = resolved;
  res.setHeader(REQUEST_ID_HEADER, resolved);
  return resolved;
}

function validationIssues(error: RequestValidationError): unknown[] {
  return [error.pathParams, error.headers, error.query, error.body].flatMap((value) => {
    if (!isRecord(value) || !Array.isArray(value.issues)) return [];
    return value.issues;
  });
}

interface BodyParserError extends Error {
  readonly status: number;
  readonly type: string;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    error instanceof Error &&
    isRecord(error) &&
    typeof error.status === 'number' &&
    typeof error.type === 'string'
  );
}

function normalizeClientErrorStatus(status: number): number {
  return status >= 400 && status < 500 ? status : 400;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
