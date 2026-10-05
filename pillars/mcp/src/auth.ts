/**
 * Inbound authentication for the `POST /mcp` route.
 *
 * Only callers holding the configured inbound token reach the tool dispatcher.
 * The gateway refuses to start without a valid token and denies requests if
 * runtime configuration becomes unreadable or invalid.
 *
 * A mounted token file takes precedence over the environment fallback. A
 * configured but unreadable or malformed file is an error, never a fallback.
 */
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { defineErrors } from '@pops/pillar-express';
import { getRequestId, mintRequestId, REQUEST_ID_HEADER } from '@pops/pillar-sdk/server';

import type { RequestHandler } from 'express';

import type { ErrorBody } from '@pops/types';

/** Registered failures for inbound MCP authentication. */
export const inboundAuthErrors = defineErrors('mcp', {
  unauthorized: {
    area: 'auth',
    status: 401,
    message: 'A valid bearer token is required.',
    retryable: false,
  },
  unavailable: {
    area: 'auth',
    status: 503,
    message: 'Inbound authentication is not configured.',
    retryable: true,
  },
});

const INBOUND_TOKEN_FILE_ENV = 'MCP_INBOUND_TOKEN_FILE';
const INBOUND_TOKEN_ENV = 'MCP_INBOUND_TOKEN';

/** Boot-fatal when the gateway has no usable inbound bearer secret. */
export class MissingInboundTokenError extends Error {
  override readonly name = 'MissingInboundTokenError' as const;

  constructor() {
    super(
      `[pops-mcp] inbound authentication is required: set ${INBOUND_TOKEN_FILE_ENV} ` +
        `or ${INBOUND_TOKEN_ENV} before the server starts.`
    );
  }
}

/** A declared token file must be readable and contain exactly one token. */
export class InvalidInboundTokenFileError extends Error {
  override readonly name = 'InvalidInboundTokenFileError' as const;

  constructor() {
    super(
      `[pops-mcp] ${INBOUND_TOKEN_FILE_ENV} must reference a readable file containing ` +
        'one non-empty bearer token.'
    );
  }
}

/** A configured environment token must contain one bearer credential. */
export class InvalidInboundTokenError extends Error {
  override readonly name = 'InvalidInboundTokenError' as const;

  constructor() {
    super(`[pops-mcp] ${INBOUND_TOKEN_ENV} must contain one non-empty bearer token.`);
  }
}

/** Read a required mounted inbound token without exposing its contents. */
function readInboundTokenFile(path: string): string {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    // Avoid echoing the configured path or any token-like value supplied in
    // place of a path. The variable name is enough to diagnose the failure.
    throw new InvalidInboundTokenFileError();
  }

  const token = contents.trim();
  if (token === '' || /\s/u.test(token)) {
    throw new InvalidInboundTokenFileError();
  }
  return token;
}

/**
 * Resolve the inbound shared secret from a mounted file, then the environment.
 * Whitespace-only env values are treated as unset.
 */
export function resolveInboundToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const filePath = env[INBOUND_TOKEN_FILE_ENV]?.trim();
  if (filePath !== undefined && filePath !== '') return readInboundTokenFile(filePath);

  const raw = env[INBOUND_TOKEN_ENV];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  if (/\s/u.test(trimmed)) throw new InvalidInboundTokenError();
  return trimmed;
}

/** Resolve a usable token or fail before the gateway starts listening. */
export function requireInboundToken(env: NodeJS.ProcessEnv = process.env): void {
  const token = resolveInboundToken(env);
  if (token === undefined) throw new MissingInboundTokenError();
}

/** Readiness helper that fails closed without exposing file or token details. */
export function isInboundAuthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    return resolveInboundToken(env) !== undefined;
  } catch {
    return false;
  }
}

export type InboundAuthDecision =
  | { readonly authorized: true; readonly mode: 'enforced' }
  | { readonly authorized: false; readonly mode: 'unconfigured'; readonly reason: string }
  | { readonly authorized: false; readonly mode: 'rejected'; readonly reason: string };

function extractBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (authorizationHeader === undefined) return undefined;
  const trimmed = authorizationHeader.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) return undefined;
  const scheme = trimmed.slice(0, spaceIndex);
  if (scheme.toLowerCase() !== 'bearer') return undefined;
  const token = trimmed.slice(spaceIndex + 1).trim();
  return token.length > 0 ? token : undefined;
}

function tokensMatch(expected: string, provided: string): boolean {
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Pure auth decision for a single request, derived from the `Authorization`
 * header and the current environment. Missing or malformed server
 * configuration is a denial, never an open mode.
 */
export function evaluateInboundAuth(authorizationHeader: string | undefined): InboundAuthDecision {
  let expected: string | undefined;
  try {
    expected = resolveInboundToken();
  } catch {
    return {
      authorized: false,
      mode: 'unconfigured',
      reason: 'Inbound authentication is not configured',
    };
  }
  if (expected === undefined) {
    return {
      authorized: false,
      mode: 'unconfigured',
      reason: 'Inbound authentication is not configured',
    };
  }
  const provided = extractBearerToken(authorizationHeader);
  if (provided === undefined) {
    return { authorized: false, mode: 'rejected', reason: 'Missing bearer token' };
  }
  if (!tokensMatch(expected, provided)) {
    return { authorized: false, mode: 'rejected', reason: 'Invalid bearer token' };
  }
  return { authorized: true, mode: 'enforced' };
}

/** Express middleware guarding the `/mcp` route with {@link evaluateInboundAuth}. */
export const inboundAuth: RequestHandler = (req, res, next) => {
  const decision = evaluateInboundAuth(req.headers.authorization);
  if (decision.authorized) {
    next();
    return;
  }
  const unavailable = decision.mode === 'unconfigured';
  if (!unavailable) res.setHeader('WWW-Authenticate', 'Bearer realm="pops-mcp"');
  const localRequestId: unknown = res.locals['requestId'];
  const requestId =
    typeof localRequestId === 'string' && localRequestId.length > 0
      ? localRequestId
      : (getRequestId() ?? mintRequestId());
  res.setHeader(REQUEST_ID_HEADER, requestId);
  const body: ErrorBody = {
    code: unavailable ? 'mcp.auth.unavailable' : 'mcp.auth.unauthorized',
    message: unavailable
      ? 'Inbound authentication is not configured.'
      : 'A valid bearer token is required.',
    requestId,
    retryable: unavailable,
  };
  res.status(unavailable ? 503 : 401).json(body);
};
