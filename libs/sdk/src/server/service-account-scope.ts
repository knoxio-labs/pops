/**
 * Scope vocabulary for service accounts, and the projection of a ts-rest
 * contract onto it.
 *
 * A scope is a dotted procedure path — `finance.transactions.list` — and a
 * grant matches by dot prefix, so `finance.transactions` authorises
 * `finance.transactions.list` but not `finance.budgets.list`. That rule was
 * previously defined only inside the registry pillar; it lives here so every
 * producer decides identically.
 *
 * {@link buildContractScopeMap} turns a ts-rest router into the
 * `(method, path) → scope` table an inbound guard needs. It walks the contract
 * structurally rather than importing `@ts-rest/core`, because the SDK binds to
 * no HTTP framework and no contract library: a leaf is any object carrying a
 * string `method` and a string `path`, which is exactly the shape ts-rest
 * gives an `AppRoute`. Deriving the table from the contract rather than hand-
 * listing it means a new route cannot be added ungated by omission.
 */

/**
 * True when `procedurePath` falls under any granted scope, matching by dot
 * prefix. An empty grant list authorises nothing.
 */
export function hasScopeFor(grantedScopes: readonly string[], procedurePath: string): boolean {
  for (const scope of grantedScopes) {
    if (scope === procedurePath) return true;
    if (procedurePath.startsWith(`${scope}.`)) return true;
  }
  return false;
}

/** One contract route projected onto the scope it requires. */
export interface ContractScopeRoute {
  /** Upper-case HTTP method, as ts-rest declares it. */
  readonly method: string;
  /** The route's declared path, `:param` placeholders intact. */
  readonly path: string;
  /** Dotted scope: the root scope plus the route's position in the router. */
  readonly scope: string;
}

/**
 * A resolved `(method, path) → scope` table. Opaque: build it with
 * {@link buildContractScopeMap} and read it with {@link resolveContractScope}.
 */
export interface ContractScopeMap {
  readonly routes: readonly ContractScopeRoute[];
  readonly literal: ReadonlyMap<string, string>;
  readonly patterns: readonly {
    readonly method: string;
    readonly regex: RegExp;
    readonly scope: string;
  }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRouteLeaf(value: unknown): value is { method: string; path: string } {
  return (
    isRecord(value) && typeof value['method'] === 'string' && typeof value['path'] === 'string'
  );
}

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * Compile a ts-rest path into an anchored matcher. `:param` segments match a
 * single non-empty path segment; a trailing slash is tolerated because Express
 * routes non-strictly by default.
 */
function compilePath(path: string): RegExp {
  const escaped = path.replace(REGEX_SPECIALS, '\\$&');
  const withParams = escaped.replace(/\/:[A-Za-z0-9_]+/g, '/([^/]+)');
  return new RegExp(`^${withParams}/?$`);
}

function literalKey(method: string, path: string): string {
  return `${method} ${path}`;
}

function collectRoutes(
  node: unknown,
  scopeTrail: readonly string[],
  into: ContractScopeRoute[]
): void {
  if (isRouteLeaf(node)) {
    into.push({ method: node.method.toUpperCase(), path: node.path, scope: scopeTrail.join('.') });
    return;
  }
  if (!isRecord(node)) return;
  for (const [key, child] of Object.entries(node)) {
    collectRoutes(child, [...scopeTrail, key], into);
  }
}

/**
 * Project a ts-rest router onto its scope table.
 *
 * @param router The contract router (a plain nested object of route leaves).
 * @param rootScope Scope prefix for the whole contract — the pillar id, so a
 *   grant reads `finance.transactions` rather than the bare `transactions`.
 */
export function buildContractScopeMap(router: unknown, rootScope: string): ContractScopeMap {
  const routes: ContractScopeRoute[] = [];
  collectRoutes(router, [rootScope], routes);

  const literal = new Map<string, string>();
  const patterns: { method: string; regex: RegExp; scope: string }[] = [];
  for (const route of routes) {
    if (route.path.includes('/:')) {
      patterns.push({ method: route.method, regex: compilePath(route.path), scope: route.scope });
    } else {
      literal.set(literalKey(route.method, route.path), route.scope);
    }
  }
  return { routes, literal, patterns };
}

/**
 * The scope a request must hold, or `undefined` when the path is not part of
 * the contract at all (health probes, the OpenAPI projection, raw webhook
 * routes) and this table therefore has nothing to say about it.
 *
 * A literal route wins over a parameterised one, so `GET /transactions/search`
 * resolves to its own scope rather than `transactions.get`'s.
 */
export function resolveContractScope(
  map: ContractScopeMap,
  method: string,
  path: string
): string | undefined {
  const upper = method.toUpperCase();
  const normalised = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  const exact = map.literal.get(literalKey(upper, normalised));
  if (exact !== undefined) return exact;
  for (const candidate of map.patterns) {
    if (candidate.method === upper && candidate.regex.test(normalised)) return candidate.scope;
  }
  return undefined;
}
