/**
 * `requireCapability` — the second half of the `/mobile` perimeter (ADR-048).
 *
 * `requireDevice` answers "is there a trusted handset behind this request".
 * This answers "is that handset allowed to make *this* request", and the two
 * are separate middlewares because they are separate questions with separate
 * recoveries: a bad token is refreshed, a revoked device pairs again, and a
 * capability the grant does not hold is neither — the app stops offering the
 * feature and the credential stays exactly as good as it was.
 *
 * ## Where the answer comes from
 *
 * The route table is derived from `bfmContract`, not written out here. A
 * hand-maintained map of path to capability would be a second place to add a
 * route, and the failure mode of forgetting the second place is a route that
 * runs ungated — which is the whole thing this file exists to prevent. Reading
 * the contract means the declaration sits beside the path in one file and the
 * gate cannot disagree with it.
 *
 * ## When the grant is resolved
 *
 * Here, per request, through `resolveDeviceCapabilities` — not at pairing, not
 * when an access token is minted, and not at refresh. The device row is
 * already loaded by `requireDevice`, so resolution costs nothing beyond the
 * comparison it feeds, and doing it any earlier would mean a set frozen into a
 * credential: a phone offline across a deploy would keep an old answer until
 * its next refresh, and a capability taken away would keep working for exactly
 * as long. Resolving at the moment of the decision means a change to the
 * default set — in either direction — lands on the very next call from every
 * device, with nothing to re-pair and no token to expire first (POPS-2928).
 *
 * ## Three ways a request does not get through, and only one of them is a 403
 *
 * 1. **The path matches no mobile route.** Fall through. There is nothing to
 *    authorise; ts-rest answers its own 404, and refusing here would turn every
 *    typo into a `403` that reads like a permissions problem.
 * 2. **The route matches and declares no capability this build recognises.**
 *    A fault in this process, raised as one — `next(error)` and a 500. It is
 *    unreachable in a shipped build because the contract guard fails first, and
 *    it must never be reachable by being read as "no capability required".
 * 3. **The route matches, declares a capability, and the grant lacks it.** The
 *    403 this file is for.
 *
 * ## Matching
 *
 * Express has already routed nothing at this point — the middleware is mounted
 * on the `/mobile` prefix, ahead of `createExpressEndpoints` — so the match is
 * made here, against the contract's own path patterns compiled to regexes.
 * Segment counts must agree and `:param` matches exactly one non-empty,
 * non-slash segment, so `/mobile/finance/transactions` and
 * `/mobile/finance/transactions/abc` are two different routes rather than one
 * accidentally covering the other.
 */
import {
  readRouteCapability,
  resolveDeviceCapabilities,
  type MobileCapability,
} from '../../contract/capabilities.js';
import { bfmContract } from '../../contract/rest.js';
import { MOBILE_PATH_PREFIX } from '../paths.js';
import { readDevice } from './require-device.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { MobileCapabilityDeniedError } from '../../contract/rest-schemas.js';

interface ContractRoute {
  readonly method: string;
  readonly path: string;
  readonly metadata?: unknown;
}

interface MobileRouteGate {
  readonly method: string;
  readonly path: string;
  readonly pattern: RegExp;
  /** `null` when the route declares nothing this build recognises. */
  readonly capability: MobileCapability | null;
}

function isRoute(value: unknown): value is ContractRoute {
  if (typeof value !== 'object' || value === null) return false;
  if (!('method' in value) || !('path' in value)) return false;
  return typeof value.method === 'string' && typeof value.path === 'string';
}

/** Every route in the contract, however deeply its sub-router is nested. */
export function collectContractRoutes(node: unknown): ContractRoute[] {
  if (isRoute(node)) return [node];
  if (typeof node !== 'object' || node === null) return [];
  return Object.values(node).flatMap(collectContractRoutes);
}

export function isMobilePath(path: string): boolean {
  return path === MOBILE_PATH_PREFIX || path.startsWith(`${MOBILE_PATH_PREFIX}/`);
}

/**
 * Compile one contract path to a matcher.
 *
 * Every literal segment is escaped, so a path containing a regex metacharacter
 * cannot widen its own pattern — the kind of thing that never happens until a
 * path grows a `.` and quietly starts matching a sibling.
 */
function compilePath(path: string): RegExp {
  const source = path
    .split('/')
    .map((segment) =>
      segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    )
    .join('/');
  return new RegExp(`^${source}$`, 'u');
}

export function buildMobileRouteGates(contract: unknown): readonly MobileRouteGate[] {
  return collectContractRoutes(contract)
    .filter((route) => isMobilePath(route.path))
    .map((route) => ({
      method: route.method.toUpperCase(),
      path: route.path,
      pattern: compilePath(route.path),
      capability: readRouteCapability(route.metadata),
    }));
}

/**
 * Raised when a mobile route is reachable and declares no capability.
 *
 * Its own class so the 500 it produces is identifiable in a log rather than
 * indistinguishable from a database fault, and so a test can assert the
 * failure mode is this one rather than a coincidence.
 */
export class UndeclaredMobileRouteError extends Error {
  override readonly name = 'UndeclaredMobileRouteError' as const;

  constructor(method: string, path: string) {
    super(
      `[bfm-api] ${method} ${path} is a mobile route declaring no capability. ` +
        'It cannot be authorised, so it is refused rather than served.'
    );
  }
}

function denied(capability: MobileCapability): MobileCapabilityDeniedError {
  return {
    code: 'capability_not_granted',
    message: 'This device has not been granted the capability this request needs.',
    capability,
  };
}

/**
 * Build the gate.
 *
 * @param contract Injectable so a test can drive the undeclared-route branch
 *   with a doctored contract. Production passes nothing and gets `bfmContract`.
 */
export function createRequireCapability(contract: unknown = bfmContract): RequestHandler {
  const gates = buildMobileRouteGates(contract);

  return (req: Request, res: Response, next: NextFunction): void => {
    // `baseUrl` is the prefix this middleware is mounted on and `path` is what
    // is left of it, so the two together are the path the contract declares.
    // `originalUrl` would carry the query string as well.
    const fullPath = `${req.baseUrl}${req.path}`;
    const method = req.method.toUpperCase();

    const gate = gates.find((entry) => entry.method === method && entry.pattern.test(fullPath));
    if (gate === undefined) {
      next();
      return;
    }

    if (gate.capability === null) {
      next(new UndeclaredMobileRouteError(method, gate.path));
      return;
    }

    const device = readDevice(res);
    const granted = resolveDeviceCapabilities(device);
    if (granted.includes(gate.capability)) {
      next();
      return;
    }

    // Worth logging, for the same reason a 403 revocation is and a 401 is not:
    // reaching this line takes a token this pillar minted, so it is a real
    // handset asking for something it was not granted — and the device id is
    // not a credential. The grant is never logged; the capability asked for is
    // the operator's actual question.
    console.warn(
      `[bfm-api] device ${device.id} asked for ${method} ${gate.path} without ${gate.capability}`
    );
    res.status(403).json(denied(gate.capability));
  };
}
