/**
 * Matching a request onto one of the pillar's contract operations.
 *
 * The mock layer is keyed by the operations the OpenAPI document declares —
 * `'GET /purchases/{id}'` — rather than by whatever the app happens to call,
 * so the coverage test can compare the two sets and a new endpoint cannot ship
 * without a fixture. That means the request path has to be matched back onto a
 * template, which is this module.
 */

/** `'<METHOD> <path template>'`, exactly as the OpenAPI document spells it. */
export type OperationKey = string;

export interface MatchedOperation {
  readonly key: OperationKey;
  /** Path parameters, by the name the template gives them. */
  readonly params: Readonly<Record<string, string>>;
}

/** `'GET /purchases/{id}'` → `{ method: 'GET', segments: [...] }`. */
function parseKey(key: OperationKey): { method: string; segments: string[] } | undefined {
  const [method, path] = key.split(' ');
  if (method === undefined || path === undefined || !path.startsWith('/')) return undefined;
  return { method: method.toUpperCase(), segments: path.split('/').slice(1) };
}

/** The parameter name a template segment declares, or `undefined` if literal. */
function parameterName(segment: string): string | undefined {
  return segment.startsWith('{') && segment.endsWith('}') ? segment.slice(1, -1) : undefined;
}

/**
 * Match one template against a path, returning its parameters and how
 * specific the match was.
 *
 * Specificity is the count of literal segments that matched. It is what
 * decides between two templates that both accept a path: `/products/aliases`
 * and `/products/{productId}` both match `/products/aliases`, and the literal
 * one is the one the server would route to. Ranking by it here rather than by
 * declaration order means the mock cannot answer a different operation than
 * the pillar would, which is the one way a mock layer lies without failing.
 */
function matchTemplate(
  templateSegments: readonly string[],
  pathSegments: readonly string[]
): { params: Record<string, string>; literals: number } | undefined {
  if (templateSegments.length !== pathSegments.length) return undefined;

  const params: Record<string, string> = {};
  let literals = 0;
  for (const [index, template] of templateSegments.entries()) {
    const actual = pathSegments[index];
    if (actual === undefined) return undefined;
    const name = parameterName(template);
    if (name === undefined) {
      if (template !== actual) return undefined;
      literals += 1;
      continue;
    }
    // A parameter matches one non-empty segment. An empty one means a double
    // slash or a trailing slash, which is not the resource the caller named.
    if (actual === '') return undefined;
    params[name] = decodeURIComponent(actual);
  }
  return { params, literals };
}

/**
 * The operation a method and path resolve to, or `undefined` when the contract
 * declares none — which the caller reports rather than guessing at.
 *
 * @param method HTTP method, any case.
 * @param path Request path with the API base prefix already removed.
 * @param keys Operation keys to match against.
 */
export function matchOperation(
  method: string,
  path: string,
  keys: Iterable<OperationKey>
): MatchedOperation | undefined {
  const pathSegments = path.split('/').slice(1);
  const wanted = method.toUpperCase();

  let best: (MatchedOperation & { literals: number }) | undefined;
  for (const key of keys) {
    const parsed = parseKey(key);
    if (parsed === undefined || parsed.method !== wanted) continue;
    const match = matchTemplate(parsed.segments, pathSegments);
    if (match === undefined) continue;
    if (best === undefined || match.literals > best.literals) {
      best = { key, params: match.params, literals: match.literals };
    }
  }

  return best === undefined ? undefined : { key: best.key, params: best.params };
}
