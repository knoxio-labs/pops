/**
 * Express identity middleware for the design pillar's comment API.
 *
 * Resolution order per request, mirroring the registry pillar's ladder with
 * one addition:
 *
 *   1. non-production → dev user (`dev@example.com`).
 *   2. no `CLOUDFLARE_ACCESS_TEAM_NAME` → tunnel user
 *      (`tunnel-authenticated@pops.local`). This pillar is only ever reached
 *      through the shell's Access-protected tunnel, so an unconfigured team
 *      means "trust the tunnel" here, not "refuse" — the bfm divergence does
 *      not apply, because no hostname bypasses Access to reach this service.
 *   3. `cf-access-jwt-assertion` → a verified principal, which is either a
 *      human session or a SERVICE TOKEN. The service half is the addition:
 *      the local dev proxy and the feedback MCP server authenticate with a
 *      Cloudflare Access service token, whose JWT carries `common_name` and
 *      no `email` at all.
 *   4. otherwise → anonymous.
 *
 * The middleware RESOLVES identity and never rejects; `requireIdentity` in
 * the handlers is the gate. There is no moderator tier: every principal that
 * gets past Access is the operator or something the operator minted, and a
 * second tier here would be a permission check with one subject.
 */
import { verifyCloudflareAccessPrincipal } from '@pops/pillar-sdk/access';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** The resolved caller. `null` means nothing vouched for this request. */
export type DesignPrincipal =
  | { kind: 'user'; email: string }
  | { kind: 'service'; commonName: string };

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
): Promise<DesignPrincipal | null> {
  if (env['NODE_ENV'] !== 'production') return { kind: 'user', email: DEV_EMAIL };
  if (!env['CLOUDFLARE_ACCESS_TEAM_NAME']) return { kind: 'user', email: TUNNEL_EMAIL };

  const token = req.headers['cf-access-jwt-assertion'];
  if (typeof token !== 'string') return null;
  try {
    return await verifyCloudflareAccessPrincipal(token, env);
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
 */
export function createIdentityMiddleware(env: NodeJS.ProcessEnv = process.env): RequestHandler {
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
