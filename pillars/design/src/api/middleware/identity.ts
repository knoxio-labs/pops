/**
 * Express identity middleware for the design pillar's comment API.
 *
 * Resolution order per request, mirroring the registry pillar's ladder with
 * one addition:
 *
 *   1. non-production → dev user (`dev@example.com`).
 *   2. no `CLOUDFLARE_ACCESS_TEAM_NAME` → tunnel user
 *      (`tunnel-authenticated@pops.local`). An unconfigured team means "trust
 *      the tunnel" here, not bfm's "refuse", for a deployment that has not
 *      set up Access at all.
 *
 *      That is NOT a claim that every request arrives through Access. The
 *      deployed host sets a team, and it is also reachable directly over the
 *      LAN and tailscale: such a browser carries no `cf-access-jwt-assertion`,
 *      so it falls to step 4 and `requireIdentity` answers 403. That refusal
 *      is correct — the request was never authenticated — and the overlay
 *      says so on screen rather than hiding as if the API were down.
 *   3. `cf-access-jwt-assertion` → a verified principal, which is either a
 *      human session or a SERVICE TOKEN. The service half is the addition:
 *      the local dev proxy and the feedback MCP server authenticate with a
 *      Cloudflare Access service token, whose JWT carries `common_name` and
 *      no `email` at all.
 *   4. otherwise → anonymous.
 *
 * A verified human is not necessarily the operator: Access admits guests too.
 * Once `POPS_OPERATOR_EMAILS` is set, a verified email outside it resolves to
 * a guest and the middleware answers 403 itself, so every route mounted after
 * it is closed to a guest without each handler having to remember. Service
 * tokens are unaffected: the operator minted them. With the list unset every
 * verified email is the operator, which is what this pillar did before guests
 * existed, so a deployment that has not been given the variable keeps working.
 *
 * Everyone else is RESOLVED and never rejected here; `requireIdentity` in the
 * handlers is the gate for an anonymous caller. There is no moderator tier:
 * what gets past this middleware is the operator or something the operator
 * minted, and a second tier would be a permission check with one subject.
 */
import {
  normalizeEmail,
  OPERATOR_EMAILS_ENV,
  readOperatorEmails,
  verifyCloudflareAccessPrincipal,
} from '@pops/pillar-sdk/access';

import { fail } from '../shared/http.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** The resolved caller. `null` means nothing vouched for this request. */
export type DesignPrincipal =
  | { kind: 'user'; email: string }
  | { kind: 'service'; commonName: string };

/** A verified Access user who is not on the operator list. No route admits one. */
export interface GuestPrincipal {
  kind: 'guest';
  email: string;
}

export interface IdentityLocals {
  principal?: DesignPrincipal | null;
}

type RequestHeaders = Pick<Request, 'headers'>;

const DEV_EMAIL = 'dev@example.com';
const TUNNEL_EMAIL = 'tunnel-authenticated@pops.local';

/**
 * Resolve the request principal. Pure of Express response concerns so it can
 * be unit-tested with a bare `{ headers }` literal.
 */
export async function resolvePrincipal(
  req: RequestHeaders,
  env: NodeJS.ProcessEnv = process.env
): Promise<DesignPrincipal | GuestPrincipal | null> {
  if (env['NODE_ENV'] !== 'production') return { kind: 'user', email: DEV_EMAIL };
  if (!env['CLOUDFLARE_ACCESS_TEAM_NAME']) return { kind: 'user', email: TUNNEL_EMAIL };

  const token = req.headers['cf-access-jwt-assertion'];
  if (typeof token !== 'string') return null;
  try {
    const principal = await verifyCloudflareAccessPrincipal(token, env);
    if (principal.kind !== 'user') return principal;
    const operators = readOperatorEmails(env);
    if (operators.size > 0 && !operators.has(normalizeEmail(principal.email))) {
      return { kind: 'guest', email: principal.email };
    }
    return principal;
  } catch (error) {
    console.error('[design-api] Access JWT verification failed:', error);
    return null;
  }
}

/**
 * Build the per-request identity middleware. Mount it before the routes so
 * every handler sees `res.locals.principal`. A failure inside resolution
 * propagates to `next` so Express surfaces a 500 rather than a silently
 * anonymous request.
 *
 * A guest is answered 403 here and reaches no route. Warns once, when built,
 * if no operator list is configured.
 */
export function createIdentityMiddleware(env: NodeJS.ProcessEnv = process.env): RequestHandler {
  if (readOperatorEmails(env).size === 0) {
    console.warn(
      `[design-api] ${OPERATOR_EMAILS_ENV} is not set, so guests are not refused: every ` +
        `verified Cloudflare Access email is treated as the operator.`
    );
  }
  return (req: Request, res: Response, next: NextFunction): void => {
    void resolvePrincipal(req, env)
      .then((principal) => {
        if (principal?.kind === 'guest') {
          fail(res, 403, 'design.auth.forbidden', 'This API is not available to this account.');
          return;
        }
        (res.locals as IdentityLocals).principal = principal;
        next();
      })
      .catch(next);
  };
}

/**
 * Read the principal a prior {@link createIdentityMiddleware} attached. An
 * absent one is treated as anonymous, so a mis-mount fails closed at the gate
 * rather than silently authorising.
 */
export function readPrincipal(res: Response): DesignPrincipal | null {
  return (res.locals as IdentityLocals).principal ?? null;
}

/** The display name a principal's writes are attributed to. */
export function principalLabel(principal: DesignPrincipal): string {
  return principal.kind === 'user' ? principal.email : principal.commonName;
}
