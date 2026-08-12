/**
 * The switches the recovery flows throw, and the man-in-the-middle one of them
 * needs.
 *
 * `pairing-to-transaction-detail.yaml` needs nothing but a healthy federation,
 * so it dials the BFM directly and this file is not in its path. Every other
 * flow needs the world to change WHILE the app is looking at it — a token
 * that has aged, a device an operator revoked, a pillar that stopped
 * answering, a pillar whose `/openapi` stops answering or answers something
 * unreadable — and a Maestro flow can reach exactly one thing outside the
 * phone: an HTTP endpoint, through `runScript`. So the seams are HTTP
 * endpoints, and they live here rather than in the BFM, which must never grow
 * a route that exists for a test.
 *
 * ## Why it also proxies
 *
 * Two of the three seams are things the harness can do on its own — the SQLite
 * database and the upstream stub are both its. Ageing a token is not: the
 * credential lives in the phone's keychain and travels on a request this
 * process never sees. So the flows that need it pair against THIS origin, and
 * everything that is not `/__e2e/` is forwarded to the real BFM verbatim. The
 * pillar behind it is the same real pillar, answering on the same real
 * contract; one armed request has its `Authorization` swapped for a token of
 * the same device that expired an hour ago, and `requireDevice` produces the
 * 401 for its own reasons.
 *
 * The flows that do not need the substitution use this origin anyway, so each
 * one carries a single base URL rather than two that must not be confused.
 *
 * ## What it counts, and why the flow reads it back
 *
 * A silent refresh is silent: the screen after one looks exactly like the
 * screen after no rejection at all, so a flow asserting only on pixels passes
 * whether or not anything was exercised. `GET /__e2e/state` reports how many
 * substitutions were spent and how many refreshes went past, and the flow
 * asserts on both — which is what makes it a test of the refresh rather than a
 * second test of the detail screen.
 *
 * It also reports `lastDeviceId`, read off the bearer token of the most recent
 * authenticated request. That is how the revocation flow names the handset it
 * is holding: every flow pairs from scratch against a database this run
 * created, so by the third one `GET /operator/devices` lists three perfectly
 * live devices and "the only one" is not an answer.
 *
 * `POST /__e2e/reset` puts all of it back, and the lane calls it BETWEEN flows
 * rather than each flow calling it first. A flow that fails halfway leaves the
 * harness however it left it — finance still refusing, an arming unspent — and
 * the next flow would then fail for a reason belonging to the previous one.
 */
import { createServer } from 'node:http';

import { deviceIdFrom, mintAgedAccessToken } from './aged-access-token.mjs';

/** Not a path any BFM route lives under, which is what keeps the two apart. */
const CONTROL_PREFIX = '/__e2e/';

/** The only prefix that carries a bearer token — `AuthenticatingMiddleware` agrees. */
const AUTHENTICATED_PREFIX = '/mobile/';

/** What a refresh looks like going past, per `pillars/bfm/src/contract/rest-device.ts`. */
const REFRESH_PATH = '/devices/refresh';

/**
 * Headers that describe one hop and must not be copied onto the next, plus the
 * two that describe a body this process re-frames: it buffers every request and
 * response, so `content-length` is recomputed and `content-encoding` would
 * describe bytes `fetch` has already decoded.
 */
const NOT_FORWARDED = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function forwardable(name) {
  return !NOT_FORWARDED.has(name.toLowerCase());
}

/**
 * Whether a request target is a plain path, and nothing that could resolve
 * somewhere else.
 *
 * HTTP/1.1 lets a client address a proxy in absolute form — `GET
 * http://elsewhere/x` — and `//elsewhere/x` is protocol-relative. Resolved
 * against the BFM's origin, either one leaves with the phone's bearer token
 * attached and arrives at a host nobody here chose. This process is a local
 * harness and no flow has ever sent such a target, which is exactly why it
 * should refuse one rather than discover the exception later.
 */
function isOriginForm(target) {
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//');
}

/** @returns {Promise<Buffer>} */
function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

/**
 * The same request's headers, minus the ones that belong to this connection.
 *
 * @param {import('node:http').IncomingHttpHeaders} incoming
 * @returns {Headers}
 */
function forwardedHeaders(incoming) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined || !forwardable(name)) continue;
    for (const single of Array.isArray(value) ? value : [value]) headers.append(name, single);
  }
  return headers;
}

/**
 * The device a request speaks for, or null when it carries no readable token.
 *
 * Same shape `requireDevice` accepts, so a header this reads is one the pillar
 * would have read too.
 */
function deviceOnRequest(header) {
  const token = /^Bearer +(?<token>\S+)$/iu.exec(header ?? '')?.groups?.['token'];
  return token === undefined ? null : deviceIdFrom(token);
}

/**
 * A bearer header for the same device, aged past its expiry — or null when
 * there is nothing to age.
 *
 * Null is reported rather than papered over: a request with no readable token
 * is one the arming was not meant for, and substituting something invented
 * would produce a 401 for a reason the flow is not testing. Leaving it alone
 * instead means the flow's `substitutions == 1` assertion fails, which is the
 * loud outcome.
 */
function agedAuthorization(header, secret) {
  const deviceId = deviceOnRequest(header);
  if (deviceId === null) return null;
  return `Bearer ${mintAgedAccessToken({ deviceId, secret, expiredForSeconds: 3_600 })}`;
}

/**
 * Start the seam server in front of `bfmBaseUrl`.
 *
 * @param {{
 *   bfmBaseUrl: string,
 *   accessTokenSecret: string,
 *   upstream: {
 *     setFinanceOutage: (active: boolean) => void,
 *     isFinanceOutage: () => boolean,
 *     setFinanceOpenApiUnreachable: (active: boolean) => void,
 *     isFinanceOpenApiUnreachable: () => boolean,
 *     setFinanceContractMismatch: (active: boolean) => void,
 *     isFinanceContractMismatch: () => boolean,
 *   },
 *   host?: string,
 * }} options
 * @returns {Promise<{ url: string, port: number, state: () => Record<string, unknown>, close: () => Promise<void> }>}
 */
export async function startControlPlane({
  bfmBaseUrl,
  accessTokenSecret,
  upstream,
  host = '127.0.0.1',
}) {
  const counters = { armed: false, substitutions: 0, refreshes: 0, lastDeviceId: null };
  const state = () => ({
    ...counters,
    financeOutage: upstream.isFinanceOutage(),
    financeOpenApiUnreachable: upstream.isFinanceOpenApiUnreachable(),
    financeContractMismatch: upstream.isFinanceContractMismatch(),
  });

  const control = (method, pathname) => {
    if (method === 'POST' && pathname === '/__e2e/access-token/expire-next') {
      counters.armed = true;
      return { status: 200, body: state() };
    }
    if (method === 'POST' && pathname === '/__e2e/reset') {
      counters.armed = false;
      counters.substitutions = 0;
      counters.refreshes = 0;
      counters.lastDeviceId = null;
      upstream.setFinanceOutage(false);
      upstream.setFinanceOpenApiUnreachable(false);
      upstream.setFinanceContractMismatch(false);
      return { status: 200, body: state() };
    }
    if (method === 'POST' && pathname === '/__e2e/finance/down') {
      upstream.setFinanceOutage(true);
      return { status: 200, body: state() };
    }
    if (method === 'POST' && pathname === '/__e2e/finance/up') {
      upstream.setFinanceOutage(false);
      return { status: 200, body: state() };
    }
    if (method === 'POST' && pathname === '/__e2e/finance/openapi-unreachable') {
      upstream.setFinanceOpenApiUnreachable(true);
      return { status: 200, body: state() };
    }
    if (method === 'POST' && pathname === '/__e2e/finance/openapi-reachable') {
      upstream.setFinanceOpenApiUnreachable(false);
      return { status: 200, body: state() };
    }
    if (method === 'POST' && pathname === '/__e2e/finance/contract-mismatch') {
      upstream.setFinanceContractMismatch(true);
      return { status: 200, body: state() };
    }
    if (method === 'POST' && pathname === '/__e2e/finance/contract-ok') {
      upstream.setFinanceContractMismatch(false);
      return { status: 200, body: state() };
    }
    if (method === 'GET' && pathname === '/__e2e/state') return { status: 200, body: state() };
    // Named rather than forwarded. A typo in a flow would otherwise reach the
    // BFM, 404 there, and read as the pillar having lost a route.
    return {
      status: 404,
      body: {
        message: `ios-e2e control plane serves no ${method} ${pathname}`,
        routes: [
          'POST /__e2e/access-token/expire-next',
          'POST /__e2e/finance/down',
          'POST /__e2e/finance/up',
          'POST /__e2e/finance/openapi-unreachable',
          'POST /__e2e/finance/openapi-reachable',
          'POST /__e2e/finance/contract-mismatch',
          'POST /__e2e/finance/contract-ok',
          'POST /__e2e/reset',
          'GET /__e2e/state',
        ],
      },
    };
  };

  const proxy = async (request, target) => {
    const headers = forwardedHeaders(request.headers);
    if (target.pathname.startsWith(AUTHENTICATED_PREFIX)) {
      const deviceId = deviceOnRequest(headers.get('authorization'));
      if (deviceId !== null) counters.lastDeviceId = deviceId;

      if (counters.armed) {
        const aged = agedAuthorization(headers.get('authorization'), accessTokenSecret);
        if (aged !== null) {
          headers.set('authorization', aged);
          counters.armed = false;
          counters.substitutions += 1;
        }
      }
    }
    if (request.method === 'POST' && target.pathname === REFRESH_PATH) counters.refreshes += 1;

    const body =
      request.method === 'GET' || request.method === 'HEAD' ? undefined : await readBody(request);
    return fetch(target, { method: request.method, headers, body, redirect: 'manual' });
  };

  const server = createServer((request, response) => {
    const json = (status, body) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };

    if (!isOriginForm(request.url)) {
      return json(400, {
        message:
          'ios-e2e control plane forwards origin-form targets only; ' +
          `${String(request.url)} could resolve to another host`,
      });
    }

    const target = new URL(request.url, bfmBaseUrl);

    if (target.pathname.startsWith(CONTROL_PREFIX)) {
      const answer = control(request.method ?? 'GET', target.pathname);
      return json(answer.status, answer.body);
    }

    void proxy(request, target)
      .then(async (answered) => {
        const payload = Buffer.from(await answered.arrayBuffer());
        for (const [name, value] of answered.headers) {
          if (forwardable(name)) response.setHeader(name, value);
        }
        response.writeHead(answered.status);
        response.end(payload);
      })
      .catch((error) => {
        // A failure HERE is the harness, not the pillar, and saying so is the
        // difference between a diagnosis and a hunt through a simulator's
        // error state.
        json(502, { message: `ios-e2e control plane could not reach the BFM: ${String(error)}` });
      });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolve);
  });

  const { port } = server.address();
  return {
    url: `http://${host}:${port}`,
    port,
    state,
    // Connections destroyed for the reason `upstream-stub.mjs` gives: the
    // phone's URLSession keeps sockets alive, and a `close()` waiting on them
    // would hold the harness open past the end of the run.
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
