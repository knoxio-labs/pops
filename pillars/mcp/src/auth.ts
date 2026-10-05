/**
 * Inbound authentication for the `POST /mcp` route.
 *
 * The gateway historically trusted the LAN and accepted any inbound MCP
 * request unauthenticated. This module adds a shared-secret bearer check so
 * only callers holding the configured inbound token reach the tool dispatcher.
 *
 * Rollout is fail-open by design: when neither inbound token variable is set
 * the route stays open and logs a loud warning. A mounted token file takes
 * precedence over the environment fallback.
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
});

const INBOUND_TOKEN_FILE_ENV = 'MCP_INBOUND_TOKEN_FILE';
const INBOUND_TOKEN_ENV = 'MCP_INBOUND_TOKEN';

/** Read a required mounted inbound token without exposing its contents. */
function readInboundTokenFile(path: string): string {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      '[pops-mcp] could not read ' + INBOUND_TOKEN_FILE_ENV + ' (' + path + '): ' + reason,
      { cause: error }
    );
  }

  const token = contents.trim();
  if (token === '') {
    throw new Error(
      '[pops-mcp] ' + INBOUND_TOKEN_FILE_ENV + ' points to an empty file (' + path + ').'
    );
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
  return trimmed.length > 0 ? trimmed : undefined;
}

export type InboundAuthDecision =
  | { readonly authorized: true; readonly mode: 'enforced' | 'open' }
  | { readonly authorized: false; readonly reason: string };

let warnedUnprotected = false;

/** Test seam — re-arms the one-shot "unprotected" warning. */
export function __resetInboundAuthWarningForTests(): void {
  warnedUnprotected = false;
}

function warnUnprotectedOnce(): void {
  if (warnedUnprotected) return;
  warnedUnprotected = true;
  console.warn(
    '[pops-mcp] SECURITY WARNING: MCP_INBOUND_TOKEN is not set and MCP_INBOUND_TOKEN_FILE is not set — the /mcp endpoint is UNAUTHENTICATED and will accept any inbound caller. Set MCP_INBOUND_TOKEN_FILE or MCP_INBOUND_TOKEN to require a bearer token on inbound requests.'
  );
}

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
 * header and the current environment. Kept side-effect-light (only the
 * one-shot unprotected warning) so it is directly unit-testable without HTTP
 * plumbing.
 */
export function evaluateInboundAuth(authorizationHeader: string | undefined): InboundAuthDecision {
  const expected = resolveInboundToken();
  if (expected === undefined) {
    warnUnprotectedOnce();
    return { authorized: true, mode: 'open' };
  }
  const provided = extractBearerToken(authorizationHeader);
  if (provided === undefined) {
    return { authorized: false, reason: 'Missing bearer token' };
  }
  if (!tokensMatch(expected, provided)) {
    return { authorized: false, reason: 'Invalid bearer token' };
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
  res.setHeader('WWW-Authenticate', 'Bearer realm="pops-mcp"');
  const localRequestId: unknown = res.locals['requestId'];
  const requestId =
    typeof localRequestId === 'string' && localRequestId.length > 0
      ? localRequestId
      : (getRequestId() ?? mintRequestId());
  res.setHeader(REQUEST_ID_HEADER, requestId);
  const body: ErrorBody = {
    code: 'mcp.auth.unauthorized',
    message: 'A valid bearer token is required.',
    requestId,
    retryable: false,
  };
  res.status(401).json(body);
};
