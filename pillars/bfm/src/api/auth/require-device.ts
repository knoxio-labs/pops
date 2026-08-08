/**
 * `requireDevice` — the perimeter in front of every `/mobile/*` route.
 *
 * bfm's hostname has Cloudflare Access bypassed (that is what lets a native
 * app reach it without a browser login), so this middleware is not one layer
 * of defence among several: it is the only thing between the public internet
 * and the federation. Everything about it fails closed.
 *
 * Two questions per request, in this order, because they have different
 * answers:
 *
 *   1. **Is this token ours, intact and current?** No → `401`. The phone
 *      still holds a refresh token; the recovery is to mint a new access
 *      token and retry.
 *   2. **Is the device it names still trusted?** No → `403`. Refreshing
 *      cannot help — the operator revoked this handset — so the app returns
 *      to pairing and wipes its keychain.
 *
 * Collapsing those into one status makes the app's recovery logic guesswork,
 * which is why `clients/ios`'s `SessionReducer` already switches on exactly
 * this split.
 */
import { findDeviceById } from '../../db/index.js';
import { AccessTokenError, verifyAccessToken } from './access-token.js';

import type { KeyObject } from 'node:crypto';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { MobileAuthError } from '../../contract/rest-schemas.js';
import type { BfmDb, DeviceRow } from '../../db/index.js';

export interface RequireDeviceDeps {
  db: BfmDb;
  accessTokenSigningKey: KeyObject;
}

/**
 * The device row {@link createRequireDevice} attaches to `res.locals` once a
 * request is past the gate. `@ts-rest/express` hands handlers the same `res`,
 * so a route reads its caller through {@link readDevice}.
 */
export interface DeviceLocals {
  device?: DeviceRow;
}

/**
 * Node collapses a repeated `Authorization` header into one comma-joined
 * string, so a request carrying two of them produces a value this rejects
 * rather than a value where the first one silently wins.
 */
function readBearerToken(req: Request): string | null {
  const raw = req.headers.authorization;
  if (typeof raw !== 'string') return null;
  const match = /^Bearer +(?<token>\S+)$/i.exec(raw);
  return match?.groups?.['token'] ?? null;
}

function refuse(res: Response, status: 401 | 403, body: MobileAuthError): void {
  if (status === 401) {
    // RFC 6750 §3: a bearer-protected resource says how to authenticate. The
    // challenge carries no description — the reason belongs in the body,
    // where it cannot be mistaken for a machine-readable hint.
    res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
  }
  res.status(status).json(body);
}

const INVALID_TOKEN: MobileAuthError = {
  code: 'invalid_token',
  message: 'Missing or invalid access token.',
};

/**
 * Build the guard bound to a database handle and the signing key.
 *
 * Mount it as a path prefix — `app.use('/mobile', requireDevice)` — rather
 * than per route. A prefix mount gates paths that do not exist yet, so a
 * later ticket cannot add a mobile route that is accidentally public; the
 * cost is that an unrouted `/mobile/*` answers 401 instead of 404, which also
 * happens not to tell an unauthenticated scanner which routes are real.
 */
export function createRequireDevice(deps: RequireDeviceDeps): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = readBearerToken(req);
    if (token === null) {
      refuse(res, 401, INVALID_TOKEN);
      return;
    }

    let deviceId: string;
    try {
      deviceId = verifyAccessToken(token, deps.accessTokenSigningKey).sub;
    } catch (error) {
      // Anything that is not a verification failure is a fault in this
      // process, not a bad request, and must surface as a 500 rather than be
      // dressed up as a rejected credential.
      if (!(error instanceof AccessTokenError)) {
        next(error);
        return;
      }
      refuse(res, 401, INVALID_TOKEN);
      return;
    }

    const device = findDeviceById(deps.db, deviceId);

    // No row at all is a 401, not a 403. `403` is what tells the app an
    // operator revoked it, and revocation never deletes a row — so an absent
    // one means something else entirely (a restored-from-old-backup database,
    // a token minted against a different deployment). Sending the phone
    // through refresh gets it a truthful `credentialsRejected` instead of a
    // revocation that never happened.
    if (device === undefined) {
      refuse(res, 401, INVALID_TOKEN);
      return;
    }

    if (device.revokedAt !== null) {
      // The only refusal worth logging. A 401 is reachable by anyone who can
      // reach the hostname, so logging those hands an internet-facing pillar
      // a log-flooding primitive; a 403 requires a signature this pillar
      // produced, which makes it a revoked handset still calling — the exact
      // event an operator wants to see after reporting a phone stolen. The
      // device id is not a credential; the token is never logged.
      console.warn(
        `[bfm-api] rejected a request from revoked device ${device.id} (revoked at ${device.revokedAt})`
      );
      refuse(res, 403, {
        code: 'device_revoked',
        message: 'This device has been revoked. Pair again.',
      });
      return;
    }

    (res.locals as DeviceLocals).device = device;
    next();
  };
}

/**
 * Read the device a prior {@link createRequireDevice} attached.
 *
 * Throws when it is absent rather than returning `undefined`: the only way to
 * reach a handler behind the guard without a device is a mis-mount, and a
 * route that silently served an anonymous caller is the failure this whole
 * module exists to prevent.
 */
export function readDevice(res: Response): DeviceRow {
  const device = (res.locals as DeviceLocals).device;
  if (device === undefined) {
    throw new Error('[bfm-api] no device on res.locals — this route is not behind requireDevice');
  }
  return device;
}
