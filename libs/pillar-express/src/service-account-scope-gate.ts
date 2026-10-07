/**
 * The Express binding for `@pops/pillar-sdk`'s inbound service-account
 * decision (ADR-044).
 *
 * The SDK owns the decision and deliberately owns nothing else: the scope
 * vocabulary, the contract projection and `authorizeServiceAccountRequest` are
 * pure over an already-read header, so `libs/sdk` binds to no HTTP framework.
 * That leaves every adopting producer to write the same ~110 lines of Express
 * plumbing, of which only three things differ — the contract, the root scope,
 * and the log prefix. `readApiKey`, the rejection log, the response bodies and
 * the promise handling are identical everywhere by construction, because the
 * semantics they implement are the ADR's, not the pillar's.
 *
 * So they live here once. This package is where the express dependency is
 * allowed to be; `@pops/pillar-sdk` stays framework-agnostic, which is the
 * property that lets the same decision serve a non-Express host later.
 */
import {
  authorizeServiceAccountRequest,
  buildContractScopeMap,
  resolveContractRoute,
  resolveContractScope,
  SERVICE_ACCOUNT_HEADER,
  type ContractScopeMap,
  type ServiceAccountVerifier,
} from '@pops/pillar-sdk/server';

import {
  createAccessIdentitySource,
  identifyRequest,
  setPrincipal,
  type AccessClassifier,
  type AccessIdentityOptions,
} from './request-principal.js';
import {
  logRejection,
  sendAuthFailure,
  type AuthFailure,
  type ServiceAccountErrorHandlers,
} from './scope-gate-rejection.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** A route a pillar serves outside its ts-rest contract, by method and Express path. */
export interface RawRouteDeclaration {
  /** HTTP method, matched case-insensitively. */
  readonly method: string;
  /** The path exactly as the Express router registers it, `:param` placeholders intact. */
  readonly path: string;
}

/**
 * Raw routes nested the way a ts-rest router nests its leaves: each key is a
 * scope segment under the root, so `{ media: { upload: … } }` under root
 * `inventory` requires `inventory.media.upload`, and a grant of
 * `inventory.media` covers every leaf beneath it.
 */
export interface RawRouteTree {
  readonly [segment: string]: RawRouteDeclaration | RawRouteTree;
}

/** What a pillar has to say to get a gate. */
export interface ServiceAccountScopeGateOptions {
  /**
   * The pillar's ts-rest contract router. Projected onto the scope table, so
   * a route added to the contract is gated the moment it exists and there is
   * no second list to forget.
   */
  readonly contract: unknown;
  /**
   * Root of the pillar's scope vocabulary — the pillar id. A grant of
   * `finance.transactions` authorises `finance.transactions.list` and nothing
   * under `finance.budgets`.
   */
  readonly rootScope: string;
  /** Prefix for rejection logs, conventionally `<pillar>-api`. */
  readonly logPrefix: string;
  /**
   * Whether a credential is mandatory on scoped paths. Defaults to `false`,
   * the ADR-044 posture: a caller presenting a key is held to its grant, and a
   * caller presenting none is left to the perimeter that already governs it.
   * Setting `true` additionally closes the unauthenticated in-network path,
   * which is a separate decision about ADR-027's trust boundary and only
   * affordable for a pillar all of whose callers carry keys.
   */
  readonly requireCredential?: boolean;
  /**
   * Routes served outside the contract that must still be scoped — raw byte
   * routes that cannot be ts-rest routes but carry data a grant should
   * govern. Omitted, every non-contract path passes untouched. Declared, each
   * route is held to exactly the contract routes' semantics: same header,
   * same dot-prefix matching, same no-key posture. A declaration the contract
   * already covers throws at construction, because its scope could never
   * apply.
   */
  readonly rawRoutes?: RawRouteTree;
  /** Optional registered failures used when a scoped request is rejected. */
  readonly errors?: ServiceAccountErrorHandlers;
  /** Test seams for the Cloudflare Access leg. Production omits it. */
  readonly identity?: AccessIdentityOptions;
}

/** A pillar's gate: the scope table it derived, and the middleware over it. */
export interface ServiceAccountScopeGate {
  /**
   * Every contract route projected onto the scope it requires. Exported by
   * convention from the adopting pillar so a test can assert it is non-empty:
   * an empty table gates nothing and still passes every behavioural test.
   */
  readonly scopeMap: ContractScopeMap;
  /**
   * The declared raw routes projected the same way, consulted only for a path
   * the contract does not describe. Empty when no raw routes were declared.
   */
  readonly rawScopeMap: ContractScopeMap;
  /**
   * Build the middleware. Mount it BEFORE `createExpressEndpoints` and before
   * every declared raw route, so it runs ahead of each handler it scopes, and
   * after any raw route that carries no scope.
   *
   * @param verify Resolves a presented key to its principal. Production passes
   *   `createRegistryServiceAccountVerifier()`; tests inject a fake.
   */
  readonly createMiddleware: (verify: ServiceAccountVerifier) => RequestHandler;
}

function readApiKey(req: Request): string | undefined {
  // `req.get` collapses a repeated header to one string, so a client sending
  // it twice is not silently read as an array and rejected as malformed.
  return req.get(SERVICE_ACCOUNT_HEADER);
}

/** The liveness probe is the one path a guest reaches without a marked route. */
function isHealthPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower === '/health' || lower === '/health/';
}

function projectRawRoutes(
  options: ServiceAccountScopeGateOptions,
  contractMap: ContractScopeMap
): ContractScopeMap {
  const { rawRoutes, rootScope, logPrefix } = options;
  const rawMap = buildContractScopeMap(rawRoutes ?? {}, rootScope);
  if (rawRoutes !== undefined && rawMap.routes.length === 0) {
    throw new Error(
      `[${logPrefix}] createServiceAccountScopeGate('${rootScope}') was given raw routes that ` +
        `projected to none. Declare each as { method, path } or omit the option.`
    );
  }
  for (const route of rawMap.routes) {
    const contractScope = resolveContractScope(contractMap, route.method, route.path);
    if (contractScope !== undefined) {
      throw new Error(
        `[${logPrefix}] raw route ${route.method} ${route.path} ('${route.scope}') is already ` +
          `covered by contract route '${contractScope}', so its declared scope would never apply.`
      );
    }
  }
  return rawMap;
}

interface GateContext {
  readonly options: ServiceAccountScopeGateOptions;
  readonly scopeMap: ContractScopeMap;
  readonly rawScopeMap: ContractScopeMap;
  readonly verify: ServiceAccountVerifier;
  readonly classify: AccessClassifier | null;
}

/**
 * One request's decision: resolve the principal, refuse a guest anywhere the
 * contract has not opened to one, then apply the service-account rule
 * unchanged. Returns the refusal to send, or `null` to proceed.
 */
async function decide(gate: GateContext, req: Request, res: Response): Promise<AuthFailure | null> {
  const { options, scopeMap, rawScopeMap, verify, classify } = gate;
  const route = resolveContractRoute(scopeMap, req.method, req.path);
  const requiredScope = route?.scope ?? resolveContractScope(rawScopeMap, req.method, req.path);
  const apiKey = readApiKey(req);

  const principal = await identifyRequest({
    classify,
    req,
    hasApiKey: apiKey !== undefined && apiKey !== '',
    scoped: requiredScope !== undefined,
  });
  if (principal === null) return { status: 401, details: { credential: 'cloudflare-access' } };
  setPrincipal(res, principal);

  if (principal.kind === 'guest' && route?.guest !== true && !isHealthPath(req.path)) {
    console.warn(
      `[${options.logPrefix}] refused a guest for ` +
        `'${requiredScope ?? 'a path outside the contract'}'`
    );
    return { status: 403, details: { principal: 'guest' } };
  }

  const result = await authorizeServiceAccountRequest({
    requiredScope,
    apiKey,
    verify,
    requireCredential: options.requireCredential,
  });
  if (result.ok) return null;
  logRejection(options.logPrefix, result);
  return {
    status: result.status,
    details:
      result.requiredScope === undefined ? undefined : { requiredScope: result.requiredScope },
  };
}

/**
 * Derive a pillar's scope table from its contract and bind ADR-044's decision
 * to Express.
 *
 * @param options The three things that vary per pillar, the posture, and any
 *   raw routes the gate must scope beside the contract.
 * @returns The scope table and a middleware factory over it.
 */
export function createServiceAccountScopeGate(
  options: ServiceAccountScopeGateOptions
): ServiceAccountScopeGate {
  const scopeMap = buildContractScopeMap(options.contract, options.rootScope);
  const { logPrefix, rootScope } = options;

  // `resolveContractScope` treats an unmatched path as "outside the
  // contract" and the auth decision admits it unconditionally (ADR-044's
  // `not-scoped` reason). An empty table therefore makes every path look
  // outside the contract, so the gate silently admits everything instead of
  // enforcing anything — and every behavioural test still passes, because
  // none of them can distinguish "correctly unscoped" from "never scoped at
  // all". Fail at construction instead of at runtime, so the wrong contract
  // object is a boot failure rather than a decorative gate.
  if (scopeMap.routes.length === 0) {
    throw new Error(
      `[${logPrefix}] createServiceAccountScopeGate('${rootScope}') projected zero routes from ` +
        `its contract. The gate would admit every request. Pass the pillar's ts-rest contract ` +
        `router (the object holding the route leaves), not its OpenAPI document, handler map, ` +
        `or an empty object.`
    );
  }

  const rawScopeMap = projectRawRoutes(options, scopeMap);

  const identitySource = createAccessIdentitySource(logPrefix, options.identity);

  const createMiddleware = (verify: ServiceAccountVerifier): RequestHandler => {
    const gate: GateContext = {
      options,
      scopeMap,
      rawScopeMap,
      verify,
      classify: identitySource.current(),
    };
    return (req: Request, res: Response, next: NextFunction): void => {
      void decide(gate, req, res)
        .then((failure) => {
          if (failure === null) {
            next();
            return;
          }
          sendAuthFailure({ options, failure, req, res, next });
        })
        .catch(next);
    };
  };

  return { scopeMap, rawScopeMap, createMiddleware };
}
