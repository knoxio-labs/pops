/**
 * Inbound authentication for the `POST /mcp` route.
 *
 * The gateway historically trusted the LAN and accepted any inbound MCP
 * request unauthenticated. This module adds a shared-secret bearer check so
 * only callers holding `MCP_INBOUND_TOKEN` reach the tool dispatcher.
 *
 * Rollout is fail-open by design: when `MCP_INBOUND_TOKEN` is unset the route
 * stays open and logs a loud warning. This lets the deployer set the token and
 * update clients without a window where live MCP access is locked out. Once the
 * token is set, every inbound request must present `Authorization: Bearer <token>`.
 */
import { timingSafeEqual } from 'node:crypto';

import type { RequestHandler } from 'express';

/**
 * Resolve the inbound shared secret from the environment. Whitespace-only or
 * empty values are treated as unset so a blank env var cannot silently arm a
 * token that no client could ever match.
 */
export function resolveInboundToken(): string | undefined {
  const raw = process.env['MCP_INBOUND_TOKEN'];
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
    '[pops-mcp] SECURITY WARNING: MCP_INBOUND_TOKEN is not set — the /mcp endpoint is UNAUTHENTICATED and will accept any inbound caller. Set MCP_INBOUND_TOKEN to require a bearer token on inbound requests.'
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
  res.status(401).json({ error: 'unauthorized', message: decision.reason });
};
