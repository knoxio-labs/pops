/**
 * Express identity middleware — bfm's operator principal resolver.
 *
 * Modelled on `pillars/registry/src/api/middleware/identity.ts`, and it
 * deliberately drops two of that chain's legs. Both omissions are the point
 * of this file, because bfm's perimeter is not the registry's:
 *
 * **No global service-account leg.** The pairing-code route has a separate,
 * narrow registry-backed service-account gate. This middleware does not turn a
 * machine credential into a human operator, so device listing and revocation
 * remain human-only.
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
 *   2. Access configured AND `cf-access-jwt-assertion` verifies → the operator
 *      when the email is in `POPS_OPERATOR_EMAILS`, a guest otherwise.
 *   3. otherwise → anonymous (`null`).
 *
 * **A verified email is not the operator by itself.** Access vouches that
 * somebody signed in, and its policy admits guests as well as the owner. A
 * guest who resolved to the operator here could mint a pairing code and pair
 * a handset holding every capability, so the operator list decides, and a
 * guest is refused with 403 by {@link requireOperator} and
 * {@link requirePairingIssuer}.
 *
 * The list is enforced only once it is set. With `POPS_OPERATOR_EMAILS` unset
 * every verified email is the operator, which is what this pillar did before
 * guests existed: a deployment that has not been given the variable must not
 * lose its owner on the next image roll.
 *
 * The middleware RESOLVES identity and never rejects globally — per-route
 * gating is the handler's job, via {@link requireOperator}. That matters here
 * because the `/devices/*` routes mount on this same app and are
 * unauthenticated by design.
 */
import {
  normalizeEmail,
  OPERATOR_EMAILS_ENV,
  readCloudflareAccessConfig,
  readOperatorEmails,
  verifyCloudflareAccessJwt,
} from '@pops/pillar-sdk/access';

import { ForbiddenError, UnauthorizedError } from '../shared/errors.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { ServiceAccountPrincipal } from '@pops/pillar-sdk/server';

/** The owner: a Cloudflare Access session whose email is on the operator list. */
export interface OperatorPrincipal {
  readonly kind: 'operator';
  readonly email: string;
}

/**
 * Somebody Access signed in who is not the owner. Carries the email because
 * guest pairing binds a device to it; no operator route accepts one.
 */
export interface GuestPrincipal {
  readonly kind: 'guest';
  readonly email: string;
}

/** A human Access vouched for, classified against the operator list. */
export type BrowserPrincipal = OperatorPrincipal | GuestPrincipal;

/**
 * Principal stashed on `res.locals` by {@link createIdentityMiddleware}.
 * Handlers read it via {@link readPrincipal}.
 */
export interface IdentityLocals {
  principal?: BrowserPrincipal | null;
  pairingServiceAccount?: ServiceAccountPrincipal | null;
}

/** The dev-fallback operator. Never reachable with `NODE_ENV=production`. */
export const DEV_OPERATOR_EMAIL = 'dev@example.com';

function readAccessTokenHeader(req: Request): string | null {
  const raw = req.headers['cf-access-jwt-assertion'];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/**
 * Resolve the request's browser principal, or `null` for an anonymous caller.
 * Pure of Express response concerns so it can be unit-tested directly.
 *
 * `env` is a parameter rather than a read of `process.env` so a test can
 * exercise the production branch without mutating the ambient environment —
 * the dev fallback would otherwise make every test caller an operator.
 */
export async function resolvePrincipal(
  req: Request,
  env: NodeJS.ProcessEnv = process.env
): Promise<BrowserPrincipal | null> {
  if (env['NODE_ENV'] !== 'production') {
    return { kind: 'operator', email: DEV_OPERATOR_EMAIL };
  }

  if (!readCloudflareAccessConfig(env)) return null;

  const token = readAccessTokenHeader(req);
  if (token === null) return null;

  try {
    const { email } = await verifyCloudflareAccessJwt(token, env);
    const operators = readOperatorEmails(env);
    if (operators.size > 0 && !operators.has(normalizeEmail(email))) {
      return { kind: 'guest', email };
    }
    return { kind: 'operator', email };
  } catch (error) {
    // The token itself is never logged, in whole or in part.
    console.error('[bfm-api] Cloudflare Access JWT verification failed:', error);
    return null;
  }
}

/**
 * Build the per-request identity middleware. Mount it BEFORE
 * `createExpressEndpoints` so every handler sees the resolved principal on
 * `res.locals.principal`. A throw inside resolution propagates to `next` so
 * Express surfaces a real 500 rather than a silently anonymous request.
 *
 * Warns once, when built, if no operator list is configured.
 */
export function createIdentityMiddleware(env: NodeJS.ProcessEnv = process.env): RequestHandler {
  if (readOperatorEmails(env).size === 0) {
    console.warn(
      `[bfm-api] ${OPERATOR_EMAILS_ENV} is not set, so guests are not refused: every verified ` +
        `Cloudflare Access email is treated as the operator.`
    );
  }
  return (req: Request, res: Response, next: NextFunction): void => {
    void resolvePrincipal(req, env)
      .then((principal) => {
        (res.locals as IdentityLocals).principal = principal;
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
export function readPrincipal(res: Response): BrowserPrincipal | null {
  return (res.locals as IdentityLocals).principal ?? null;
}

/** Read the scoped service-account principal attached to the pairing route. */
export function readPairingServiceAccount(res: Response): ServiceAccountPrincipal | null {
  return (res.locals as IdentityLocals).pairingServiceAccount ?? null;
}

/** The identities permitted to mint a pairing code. */
export type PairingIssuer =
  | { readonly kind: 'operator'; readonly email: string }
  | { readonly kind: 'service-account'; readonly id: string; readonly name: string };

/**
 * Require either the human operator principal or the pairing route's verified
 * service-account principal.
 *
 * A verified service account outranks a guest session on the same request,
 * matching the pairing route's scope gate, which treats a presented key as
 * the caller's identity. A guest with no such key is refused with
 * {@link ForbiddenError}; a caller with nothing at all with
 * {@link UnauthorizedError}.
 */
export function requirePairingIssuer(res: Response): PairingIssuer {
  const principal = readPrincipal(res);
  if (principal?.kind === 'operator') return { kind: 'operator', email: principal.email };

  const serviceAccount = readPairingServiceAccount(res);
  if (serviceAccount !== null) {
    return { kind: 'service-account', id: serviceAccount.id, name: serviceAccount.name };
  }

  if (principal !== null) throw new ForbiddenError();
  throw new UnauthorizedError(
    'This endpoint requires an operator session or authorised service account.'
  );
}

/**
 * The operator gate. Throws {@link UnauthorizedError} (401) for an anonymous
 * caller and {@link ForbiddenError} (403) for a guest; `runHttp` maps both to
 * the wire envelope.
 */
export function requireOperator(principal: BrowserPrincipal | null): OperatorPrincipal {
  if (principal === null) throw new UnauthorizedError();
  if (principal.kind !== 'operator') throw new ForbiddenError();
  return principal;
}
