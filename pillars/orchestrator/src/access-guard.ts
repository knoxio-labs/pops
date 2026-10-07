/**
 * Refuses a Cloudflare Access guest on the orchestrator.
 *
 * This pillar has no caller identity of its own: its callers are sibling
 * pillars on the internal network and the shell's browser through nginx. The
 * second kind arrives with the `cf-access-jwt-assertion` header Access adds,
 * and since Access admits guests as well as the owner, that header can belong
 * to somebody who must not search every pillar or list its AI tools.
 *
 * The guard only ever acts on a request that carries the header. One without
 * it came over the LAN, Tailscale or from a sibling pillar, and passes exactly
 * as it did before the guard existed. A service token, which carries no email
 * to hold against the operator list, passes too: the operator minted it.
 *
 * It is inert until both `POPS_OPERATOR_EMAILS` and
 * `CLOUDFLARE_ACCESS_TEAM_NAME` are set. A deployment that has not been given
 * them keeps running as it was, because turning either absence into a refusal
 * would lock the owner out on the next image roll.
 */
import { ACCESS_JWT_HEADER, defineErrors } from '@pops/pillar-express';
import {
  normalizeEmail,
  OPERATOR_EMAILS_ENV,
  readCloudflareAccessConfig,
  readOperatorEmails,
  verifyCloudflareAccessPrincipal,
  type CloudflareAccessPrincipal,
} from '@pops/pillar-sdk/access';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

const accessErrors = defineErrors('orchestrator', {
  invalid_session: {
    area: 'auth',
    status: 401,
    message: 'The Cloudflare Access session on this request is not valid.',
    retryable: false,
  },
  forbidden: {
    area: 'auth',
    status: 403,
    message: 'This API is not available to this account.',
    retryable: false,
  },
});

async function verify(token: string, env: NodeJS.ProcessEnv): Promise<CloudflareAccessPrincipal> {
  try {
    return await verifyCloudflareAccessPrincipal(token, env);
  } catch (error) {
    // An `Error` message from the verifier never carries the token itself.
    const reason = error instanceof Error ? error.message : 'unknown error';
    console.warn(`[orchestrator] rejected a Cloudflare Access token (${reason})`);
    return accessErrors.invalid_session();
  }
}

async function assertNotGuest(
  token: string,
  env: NodeJS.ProcessEnv,
  operators: ReadonlySet<string>
): Promise<void> {
  const principal = await verify(token, env);
  if (principal.kind === 'user' && !operators.has(normalizeEmail(principal.email))) {
    accessErrors.forbidden();
  }
}

/** The variable whose absence keeps the guard off, or `null` when it can run. */
function missingVariable(env: NodeJS.ProcessEnv, operators: ReadonlySet<string>): string | null {
  if (operators.size === 0) return OPERATOR_EMAILS_ENV;
  if (readCloudflareAccessConfig(env) === null) return 'CLOUDFLARE_ACCESS_TEAM_NAME';
  return null;
}

/**
 * Build the guard. Mount it after `/health` and before every other route.
 *
 * A present token that does not verify is answered 401 and a verified email
 * outside the operator list 403, both through the pillar's error handler.
 * Warns once, when built, if either variable it needs is missing.
 *
 * @param env Defaults to the ambient environment; a test passes its own.
 */
export function createAccessGuard(env: NodeJS.ProcessEnv = process.env): RequestHandler {
  const operators = readOperatorEmails(env);
  const missing = missingVariable(env, operators);

  if (missing !== null) {
    console.warn(
      `[orchestrator] ${missing} is not set, so guests are not refused: Cloudflare Access ` +
        `tokens are not verified here and every request is served.`
    );
    return (_req: Request, _res: Response, next: NextFunction): void => next();
  }

  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = req.get(ACCESS_JWT_HEADER);
    if (token === undefined || token === '') {
      next();
      return;
    }
    void assertNotGuest(token, env, operators).then(() => next(), next);
  };
}
