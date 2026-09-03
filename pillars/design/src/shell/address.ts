/**
 * The canonical address. One reviewable surface, one URL:
 *
 *   /[x/<experiment>/<variant>/]s/<area>/<group…>/<screen>[?step=<step>][&state=<state>][#<anchor>]
 *
 * This module is the single place routing, navigation and comment anchoring
 * agree on how a surface maps to a URL. It is pure string ↔ coordinates; the
 * registry-aware resolution (which screens, steps and states actually exist)
 * lives in `surface.ts`.
 *
 * The screen path has no fixed length — groups nest as deep as the tree does —
 * which is why the step is a query parameter rather than a trailing segment:
 * a trailing segment could not be told from a deeper screen without loading
 * the catalog, and this module deliberately never does.
 */
export interface Address {
  experimentId?: string;
  variantId?: string;
  /** The screen id split on `/`: `<area>`, then any groups, then the slug. */
  path: string[];
  /** A flow step's own slug. */
  stepId?: string;
  state?: string;
  anchor?: string;
}

/** A query or fragment value is a coordinate only when it says something. */
function nonEmpty(value: string | null | undefined): string | undefined {
  return value === null || value === undefined || value === '' ? undefined : value;
}

const ADDRESS_RE = /^\/(?:x\/([^/]+)\/([^/]+)\/)?s\/(.+?)\/?$/u;

/** The screen id (`<area>/<group…>/<slug>`) an address points at. */
export function screenIdOf(a: Pick<Address, 'path'>): string {
  return a.path.join('/');
}

/** The path of a screen id, for the places that hold an id rather than an address. */
export function pathOf(screenId: string): string[] {
  return screenId.split('/');
}

export function buildAddress(a: Address): string {
  const design = a.experimentId && a.variantId ? `x/${a.experimentId}/${a.variantId}/` : '';
  const params = new URLSearchParams();
  if (a.stepId) params.set('step', a.stepId);
  if (a.state) params.set('state', a.state);
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const anchor = a.anchor ? `#${a.anchor}` : '';
  return `/${design}s/${a.path.join('/')}${query}${anchor}`;
}

/**
 * Parse a canonical address from its parts. `search` is the raw
 * `location.search` (`?state=empty`), `hash` the raw `location.hash`
 * (`#submit`). Null for any path that is not a screen address — which
 * includes a screen path with no area to sit in.
 */
export function parseAddress(pathname: string, search = '', hash = ''): Address | null {
  const match = pathname.match(ADDRESS_RE);
  if (!match) return null;
  const [, experimentId, variantId, raw] = match;
  const path = (raw ?? '').split('/');
  if (path.length < 2 || path.some((segment) => segment === '')) return null;
  const query = new URLSearchParams(search);
  const anchor = hash.startsWith('#') ? hash.slice(1) : hash;
  return {
    experimentId,
    variantId,
    path,
    stepId: nonEmpty(query.get('step')),
    state: nonEmpty(query.get('state')),
    anchor: nonEmpty(anchor),
  };
}

/** What the target screen can honour: its step slugs — the single path
 *  segment the address grammar carries, not the step's catalog-wide id
 *  (empty = leaf) — and the state ids available at a given step (or on the
 *  screen itself). */
export interface Capabilities {
  steps: string[];
  statesFor: (stepId: string | undefined) => string[];
}

/**
 * Best-effort coordinate preservation: keep the step and state when the
 * target surface has them, otherwise drop to the nearest valid parent — a
 * non-flow target drops the step; a surface without the named state drops
 * the state. Design and screen are taken as given.
 */
export function preserveCoordinates(desired: Address, target: Capabilities): Address {
  let stepId: string | undefined;
  if (target.steps.length > 0) {
    stepId =
      desired.stepId && target.steps.includes(desired.stepId) ? desired.stepId : target.steps[0];
  }
  const states = target.statesFor(stepId);
  const state = desired.state && states.includes(desired.state) ? desired.state : undefined;
  return { ...desired, stepId, state };
}
