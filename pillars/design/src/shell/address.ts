/**
 * The canonical address. One reviewable surface, one URL:
 *
 *   /[x/<experiment>/<variant>/]s/<area>/<screen>[/<step>][?state=<state>][#<anchor>]
 *
 * This module is the single place routing, navigation and (later) comment
 * anchoring agree on how a surface maps to a URL. It is pure string ↔
 * coordinates; the registry-aware resolution (which screens, steps and
 * states actually exist) lives in `surface.ts`.
 */
export interface Address {
  experimentId?: string;
  variantId?: string;
  area: string;
  slug: string;
  stepId?: string;
  state?: string;
  anchor?: string;
}

/** A query or fragment value is a coordinate only when it says something. */
function nonEmpty(value: string | null | undefined): string | undefined {
  return value === null || value === undefined || value === '' ? undefined : value;
}

const ADDRESS_RE = /^\/(?:x\/([^/]+)\/([^/]+)\/)?s\/([^/]+)\/([^/]+)(?:\/([^/]+))?\/?$/u;

/** The screen id (`<area>/<slug>`) an address points at. */
export function screenIdOf(a: Pick<Address, 'area' | 'slug'>): string {
  return `${a.area}/${a.slug}`;
}

export function buildAddress(a: Address): string {
  const design = a.experimentId && a.variantId ? `x/${a.experimentId}/${a.variantId}/` : '';
  const step = a.stepId ? `/${a.stepId}` : '';
  const query = a.state ? `?state=${encodeURIComponent(a.state)}` : '';
  const anchor = a.anchor ? `#${a.anchor}` : '';
  return `/${design}s/${a.area}/${a.slug}${step}${query}${anchor}`;
}

/**
 * Parse a canonical address from its parts. `search` is the raw
 * `location.search` (`?state=empty`), `hash` the raw `location.hash`
 * (`#submit`). Null for any path that is not a screen address.
 */
export function parseAddress(pathname: string, search = '', hash = ''): Address | null {
  const match = pathname.match(ADDRESS_RE);
  if (!match) return null;
  const [, experimentId, variantId, area, slug, stepId] = match;
  if (!area || !slug) return null;
  const state = new URLSearchParams(search).get('state');
  const anchor = hash.startsWith('#') ? hash.slice(1) : hash;
  return {
    experimentId,
    variantId,
    area,
    slug,
    stepId,
    state: nonEmpty(state),
    anchor: nonEmpty(anchor),
  };
}

/** What the target screen can honour: its step ids (empty = leaf) and the
 *  state ids available at a given step (or on the screen itself). */
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
