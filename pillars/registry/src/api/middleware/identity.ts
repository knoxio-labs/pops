/**
 * Express identity middleware — the core pillar's canonical principal
 * resolver for its REST surface.
 *
 * Resolution order per request:
 *
 *   1. `x-api-key` → `serviceAccountsService.authenticateServiceAccount`.
 *   2. non-production → dev fallback user (`dev@example.com`), the operator.
 *   3. no `CLOUDFLARE_ACCESS_TEAM_NAME` → tunnel user
 *      (`tunnel-authenticated@pops.local`), the operator.
 *   4. `cf-access-jwt-assertion` → `verifyCloudflareAccessJwt` → the operator
 *      when the email is in `POPS_OPERATOR_EMAILS`, otherwise a guest.
 *   5. otherwise → anonymous (`{ user: null, serviceAccount: null }`).
 *
 * Guests exist only once `POPS_OPERATOR_EMAILS` is set. With the list unset
 * every verified email is the operator, which is what a deployment did before
 * guests existed: reading the missing list as "nobody is the operator" would
 * lock the owner out of a running system on the next image roll.
 *
 * The middleware RESOLVES identity — it never rejects globally. Per-route
 * gating lives in the handlers via {@link requireUser} / {@link requireProtected}
 * / {@link requireSession}; public routes need no principal at all.
 *
 * The resolved principal is attached to `res.locals.principal`, which the
 * ts-rest/express handlers read through the `res` they are handed (see
 * `@ts-rest/express`'s `AppRouteImplementation`, which passes `{ req, res }`).
 */
import {
  normalizeEmail,
  OPERATOR_EMAILS_ENV,
  readOperatorEmails,
  verifyCloudflareAccessJwt,
} from '@pops/pillar-sdk/access';
import { SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import {
  type AuthenticatedServiceAccount,
  type CoreDb,
  serviceAccountKeys,
  serviceAccountsService,
} from '../../db/index.js';
import { ForbiddenError, UnauthorizedError } from '../shared/errors.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Whether a human principal is the owner or someone the owner let in. */
export type UserKind = 'operator' | 'guest';

/** The authenticated human principal — a Cloudflare Access session identity. */
export interface User {
  email: string;
  kind: UserKind;
  /**
   * Whether `email` came out of a verified Access token. `false` on the dev
   * and tunnel fallbacks, whose address is a placeholder for "whoever is on
   * this network" and not a person's.
   */
  accessVerified: boolean;
}

function fallbackOperator(email: string): User {
  return { email, kind: 'operator', accessVerified: false };
}

function classifyVerifiedEmail(email: string): User {
  const operators = readOperatorEmails();
  const isOperator = operators.size === 0 || operators.has(normalizeEmail(email));
  return { email, kind: isOperator ? 'operator' : 'guest', accessVerified: true };
}

/**
 * The principal resolved per request: the human `user` and/or the
 * authenticated `serviceAccount`. The DB handle is injected into handlers
 * separately, so it is not carried here.
 */
export interface Principal {
  user: User | null;
  serviceAccount: AuthenticatedServiceAccount | null;
}

/**
 * Principal stashed on `res.locals` by {@link createIdentityMiddleware}.
 * Handlers read it via {@link readPrincipal}.
 */
export interface IdentityLocals {
  principal?: Principal;
}

/**
 * Every function below reads only `headers` off the request, so that is all
 * they declare — a plain `{ headers }` literal satisfies this structurally,
 * which is what lets {@link resolvePrincipal} be unit-tested with a bare
 * object instead of a cast through a real Express `Request`.
 */
type RequestHeaders = Pick<Request, 'headers'>;

function readApiKeyHeader(req: RequestHeaders): string | null {
  const raw = req.headers[SERVICE_ACCOUNT_HEADER];
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return null;
}

async function tryServiceAccountAuth(
  coreDb: CoreDb,
  req: RequestHeaders
): Promise<AuthenticatedServiceAccount | null> {
  const header = readApiKeyHeader(req);
  if (!header) return null;
  const parsed = serviceAccountKeys.parseApiKey(header);
  if (!parsed) return null;
  return serviceAccountsService.authenticateServiceAccount(coreDb, parsed.prefix, parsed.secret);
}

/**
 * Resolve the request principal. Pure of Express response concerns so it can
 * be unit-tested directly.
 */
export async function resolvePrincipal(coreDb: CoreDb, req: RequestHeaders): Promise<Principal> {
  const serviceAccount = await tryServiceAccountAuth(coreDb, req);
  if (serviceAccount) {
    return { user: null, serviceAccount };
  }

  if (process.env['NODE_ENV'] !== 'production') {
    return { user: fallbackOperator('dev@example.com'), serviceAccount: null };
  }

  if (!process.env['CLOUDFLARE_ACCESS_TEAM_NAME']) {
    return { user: fallbackOperator('tunnel-authenticated@pops.local'), serviceAccount: null };
  }

  const token = req.headers['cf-access-jwt-assertion'];
  if (typeof token === 'string') {
    try {
      const identity = await verifyCloudflareAccessJwt(token);
      return { user: classifyVerifiedEmail(identity.email), serviceAccount: null };
    } catch (error) {
      console.error('[core-api] JWT verification failed:', error);
      return { user: null, serviceAccount: null };
    }
  }

  return { user: null, serviceAccount: null };
}

function missingClassificationVariable(): string | null {
  if (!process.env['CLOUDFLARE_ACCESS_TEAM_NAME']) return 'CLOUDFLARE_ACCESS_TEAM_NAME';
  if (readOperatorEmails().size === 0) return OPERATOR_EMAILS_ENV;
  return null;
}

/**
 * Say once, when the app is built, that nobody will be classified as a guest.
 * Silent outside production: the dev fallback makes every request the
 * operator there whatever is configured.
 */
function warnWhenClassificationIsOff(): void {
  if (process.env['NODE_ENV'] !== 'production') return;
  const missing = missingClassificationVariable();
  if (missing === null) return;
  console.warn(
    `[core-api] ${missing} is not set, so guest classification is off: every user this ` +
      `pillar resolves is treated as the operator.`
  );
}

/**
 * Build the per-request identity middleware bound to a core DB handle. Mount
 * it BEFORE `createExpressEndpoints` so every REST handler sees the resolved
 * principal on `res.locals.principal`. Resolution failures inside the auth
 * pipeline (e.g. a thrown DB error) propagate to `next` so Express surfaces a
 * real 500 rather than a silent anonymous request.
 */
export function createIdentityMiddleware(coreDb: CoreDb): RequestHandler {
  warnWhenClassificationIsOff();
  return (req: Request, res: Response, next: NextFunction): void => {
    void resolvePrincipal(coreDb, req)
      .then((principal) => {
        (res.locals as IdentityLocals).principal = principal;
        next();
      })
      .catch(next);
  };
}

/**
 * Read the principal a prior {@link createIdentityMiddleware} attached. If
 * the middleware did not run (mis-wiring) the principal is absent — treated
 * as fully anonymous so a missing mount fails closed at the gate rather than
 * silently authorising.
 */
export function readPrincipal(res: Response): Principal {
  const fromLocals = (res.locals as IdentityLocals).principal;
  return fromLocals ?? { user: null, serviceAccount: null };
}

function refuseGuest(user: User): void {
  if (user.kind === 'guest') {
    throw new ForbiddenError('This endpoint is not available to a guest.');
  }
}

/**
 * `userOnly` gate — requires the operator's human session. Service-account
 * principals are rejected unconditionally. Throws {@link UnauthorizedError}
 * (401) for a caller with no session and {@link ForbiddenError} (403) for a
 * guest; `runHttp` maps both to the wire envelope.
 */
export function requireUser(principal: Principal): User {
  if (!principal.user) {
    throw new UnauthorizedError('This endpoint requires a Cloudflare Access user session.');
  }
  refuseGuest(principal.user);
  return principal.user;
}

/**
 * Session gate — any human session, operator or guest. The one gate a guest
 * passes, for routes that only say who is signed in. Throws
 * {@link UnauthorizedError} (401) for a service account or an anonymous caller.
 */
export function requireSession(principal: Principal): User {
  if (!principal.user) {
    throw new UnauthorizedError('This endpoint requires a Cloudflare Access user session.');
  }
  return principal.user;
}

/**
 * `protected` gate — the operator's session OR a service account whose granted
 * scopes cover `path`: the operator passes unconditionally; a service account
 * passes only with the matching scope; an anonymous caller is rejected. A scope
 * miss and the anonymous case both collapse to a single 401 on the REST
 * surface — the caller cannot reach the resource either way. A guest is a
 * known person who may not have it, which is {@link ForbiddenError} (403).
 */
export function requireProtected(principal: Principal, path: string): Principal {
  if (principal.user) {
    refuseGuest(principal.user);
    return principal;
  }

  if (principal.serviceAccount) {
    if (!serviceAccountsService.hasScopeFor(principal.serviceAccount.scopes, path)) {
      throw new UnauthorizedError(
        `Service account '${principal.serviceAccount.name}' is not authorised for '${path}'`
      );
    }
    return principal;
  }

  throw new UnauthorizedError(
    'Missing or invalid credentials (expected Cloudflare Access JWT or X-API-Key)'
  );
}
