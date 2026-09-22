import { readCloudflareAccessConfig, verifyCloudflareAccessJwt } from '@pops/pillar-sdk/access';
import {
  SERVICE_ACCOUNT_HEADER,
  type ServiceAccountPrincipal,
  type ServiceAccountVerifier,
} from '@pops/pillar-sdk/server';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** The human or machine identity available to catalogue authoring handlers. */
export interface InventoryPrincipal {
  readonly user: { readonly email: string } | null;
  readonly serviceAccount: ServiceAccountPrincipal | null;
}

/** The resolver contract injected by API tests and alternate edge deployments. */
export type InventoryIdentityResolver = (request: Request) => Promise<InventoryPrincipal>;

/** Principal storage attached to the Express response for one request. */
export interface InventoryIdentityLocals {
  inventoryPrincipal?: InventoryPrincipal;
}

function accessToken(request: Request): string | null {
  const value = request.headers['cf-access-jwt-assertion'];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Resolves a request to an Access user and/or verified service account. */
export function resolveInventoryPrincipal(
  request: Request,
  verify: ServiceAccountVerifier,
  env: NodeJS.ProcessEnv = process.env
): Promise<InventoryPrincipal> {
  return Promise.all([
    resolveInventoryUser(request, env),
    resolveInventoryServiceAccount(request, verify),
  ]).then(([user, serviceAccount]) => ({ user, serviceAccount }));
}

async function resolveInventoryUser(
  request: Request,
  env: NodeJS.ProcessEnv
): Promise<{ readonly email: string } | null> {
  if (!readCloudflareAccessConfig(env)) return null;
  const token = accessToken(request);
  if (token === null) return null;
  try {
    const identity = await verifyCloudflareAccessJwt(token, env);
    return { email: identity.email };
  } catch (error) {
    console.error('[inventory-api] Cloudflare Access JWT verification failed:', error);
    return null;
  }
}

async function resolveInventoryServiceAccount(
  request: Request,
  verify: ServiceAccountVerifier
): Promise<ServiceAccountPrincipal | null> {
  const key = request.get(SERVICE_ACCOUNT_HEADER);
  if (key === undefined || key === '') return null;
  const result = await verify(key);
  return result.outcome === 'authenticated' ? result.principal : null;
}

/** Mounts request identity resolution before the service-account scope gate. */
export function createInventoryIdentityMiddleware(
  verify: ServiceAccountVerifier,
  resolve: InventoryIdentityResolver = (request) => resolveInventoryPrincipal(request, verify)
): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    void resolve(request)
      .then((principal) => {
        (response.locals as InventoryIdentityLocals).inventoryPrincipal = principal;
        next();
      })
      .catch(next);
  };
}

/** Reads the identity resolved by {@link createInventoryIdentityMiddleware}. */
export function readInventoryPrincipal(response: Response): InventoryPrincipal {
  return (
    (response.locals as InventoryIdentityLocals).inventoryPrincipal ?? {
      user: null,
      serviceAccount: null,
    }
  );
}
