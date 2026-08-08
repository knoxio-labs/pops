/**
 * Express identity middleware — bfm's operator principal resolver.
 *
 * Modelled on `pillars/registry/src/api/middleware/identity.ts`, and it
 * deliberately drops two of that chain's legs. Both omissions are the point
 * of this file, because bfm's perimeter is not the registry's:
 *
 * **No service-account leg.** The registry authenticates `x-api-key` against
 * its own `service_accounts` table. bfm has no such table, and the registry
 * exposes no endpoint to verify a presented key — only list/create/revoke. So
 * there is nothing an `x-api-key` could be checked against here, and a machine
 * caller has no business minting pairing codes or revoking handsets anyway.
 * The service account bfm itself holds is for its OUTBOUND calls to sibling
 * pillars, which is the opposite direction.
 *
 * **No "tunnel-authenticated" fallback.** The registry treats a missing
 * `CLOUDFLARE_ACCESS_TEAM_NAME` as "we are only reachable through an
 * Access-protected tunnel, so trust the caller". That reasoning does not
 * transfer: bfm's own hostname has Access BYPASSED so the phone can reach the
 * device-facing routes, and the same Express app answers on it. Carrying that
 * leg over would resolve every caller on the public internet to an
 * authenticated operator. Here, an unconfigured Access in production means
 * anonymous — the operator surface goes dark rather than open.
 *
 * Resolution order per request:
 *
 *   1. non-production → dev fallback operator (`dev@example.com`).
 *   2. Access configured AND `cf-access-jwt-assertion` verifies → `{ email }`.
 *   3. otherwise → anonymous (`null`).
 *
 * The middleware RESOLVES identity and never rejects globally — per-route
 * gating is the handler's job, via {@link requireOperator}. That matters here
 * because the `/devices/*` routes mount on this same app and are
 * unauthenticated by design.
 */
import { readCloudflareAccessConfig, verifyCloudflareAccessJwt } from '@pops/pillar-sdk/access';

import { UnauthorizedError } from '../shared/errors.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** The authenticated human principal — a Cloudflare Access session identity. */
export interface OperatorPrincipal {
  email: string;
}

/**
 * Principal stashed on `res.locals` by {@link createIdentityMiddleware}.
 * Handlers read it via {@link readPrincipal}.
 */
export interface IdentityLocals {
  operator?: OperatorPrincipal | null;
}

/** The dev-fallback operator. Never reachable with `NODE_ENV=production`. */
export const DEV_OPERATOR_EMAIL = 'dev@example.com';

function readAccessTokenHeader(req: Request): string | null {
  const raw = req.headers['cf-access-jwt-assertion'];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/**
 * Resolve the request's operator principal, or `null` for an anonymous
 * caller. Pure of Express response concerns so it can be unit-tested directly.
 *
 * `env` is a parameter rather than a read of `process.env` so a test can
 * exercise the production branch without mutating the ambient environment —
 * the dev fallback would otherwise make every test caller an operator.
 */
export async function resolveOperator(
  req: Request,
  env: NodeJS.ProcessEnv = process.env
): Promise<OperatorPrincipal | null> {
  if (env['NODE_ENV'] !== 'production') {
    return { email: DEV_OPERATOR_EMAIL };
  }

  if (!readCloudflareAccessConfig(env)) return null;

  const token = readAccessTokenHeader(req);
  if (token === null) return null;

  try {
    const identity = await verifyCloudflareAccessJwt(token, env);
    return { email: identity.email };
  } catch (error) {
    // The token itself is never logged, in whole or in part.
    console.error('[bfm-api] Cloudflare Access JWT verification failed:', error);
    return null;
  }
}

/**
 * Build the per-request identity middleware. Mount it BEFORE
 * `createExpressEndpoints` so every handler sees the resolved principal on
 * `res.locals.operator`. A throw inside resolution propagates to `next` so
 * Express surfaces a real 500 rather than a silently anonymous request.
 */
export function createIdentityMiddleware(env: NodeJS.ProcessEnv = process.env): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    void resolveOperator(req, env)
      .then((operator) => {
        (res.locals as IdentityLocals).operator = operator;
        next();
      })
      .catch(next);
  };
}

/**
 * Read the principal a prior {@link createIdentityMiddleware} attached. An
 * absent value — the middleware was never mounted — reads as anonymous, so a
 * mis-wiring fails closed at the gate rather than silently authorising.
 */
export function readPrincipal(res: Response): OperatorPrincipal | null {
  return (res.locals as IdentityLocals).operator ?? null;
}

/**
 * The operator gate. Throws {@link UnauthorizedError} (401), which `runHttp`
 * maps to the wire envelope.
 */
export function requireOperator(principal: OperatorPrincipal | null): OperatorPrincipal {
  if (!principal) throw new UnauthorizedError();
  return principal;
}
