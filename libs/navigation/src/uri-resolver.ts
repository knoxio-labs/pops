/**
 * Resolves POPS URIs (pops:{app}/{type}/{id}) to frontend routes.
 *
 * Each search adapter produces URIs like "pops:media/movie/42". This module
 * maps those to the correct frontend route ("/media/movies/42") so that
 * clicking a search result navigates to the right page.
 */

/** The payload a search hit carries beside its URI. */
export type SearchHitData = Readonly<Record<string, unknown>>;

/**
 * How a `{app}/{type}` opens.
 *
 * A string is a route prefix the URI's own id is appended to, which is the
 * shape every type has when it is addressed by its own primary key. A function
 * is for a type that is not: it reads the hit's `data` and answers with a whole
 * route, or with null when the hit does not carry what the route needs. ADR-012
 * keeps the id segment a single row's primary key, so a subordinate row that
 * has no page of its own cannot smuggle its parent's id through the URI.
 */
type RouteRule = string | ((id: string, data: SearchHitData) => string | null);

/** Read a string field off a hit's data, or null when it is absent or empty. */
function stringField(data: SearchHitData, field: string): string | null {
  const value = data[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Map of {app}/{type} → how a hit of that type opens.
 *
 * Entities moved to the contacts pillar: a contact search hit is
 * `pops:contacts/contact/<id>` → `/contacts`. The legacy `finance/entity`
 * mapping is KEPT during the rolling deploy (core still emits it from its
 * search adapter until the Stage 4a core-entities removal); both resolve so a
 * shell/orchestrator rolling at its own cadence never produces a dead link.
 *
 * A purchase line has no page of its own — the pillar's only item read is
 * scoped under an order (`GET /purchases/{id}/items/{itemId}`) — so an item hit
 * opens the order it was bought on, at the line. The order id comes from the
 * hit's `data`, where the purchases search adapter already puts it, because a
 * line is meaningless without its order. A hit that arrives without one does
 * not resolve: sending it to some other order would be worse than not moving.
 */
const URI_ROUTE_MAP: Record<string, RouteRule> = {
  'media/movie': '/media/movies',
  'media/tv-show': '/media/tv',
  'finance/transaction': '/finance/transactions',
  'finance/entity': '/finance/entities',
  'finance/budget': '/finance/budgets',
  'inventory/item': '/inventory/items',
  'contacts/contact': '/contacts',
  'purchases/purchase': '/purchases',
  'purchases/purchase-item': (itemId, data) => {
    const purchaseId = stringField(data, 'purchaseId');
    return purchaseId === null ? null : `/purchases/${purchaseId}?item=${itemId}`;
  },
};

/**
 * Resolve a POPS URI to a frontend route path.
 *
 * @param uri - A URI like "pops:media/movie/42"
 * @param data - The hit's payload, read only by types whose route is not
 * addressed by the URI's own id (a purchase line opens its order).
 * @returns The frontend route (e.g. "/media/movies/42"), or null if unresolvable.
 */
export function resolveUri(uri: string, data: SearchHitData = {}): string | null {
  if (!uri.startsWith('pops:')) return null;

  const rest = uri.slice(5); // Remove "pops:" prefix
  const lastSlash = rest.lastIndexOf('/');
  if (lastSlash === -1) return null;

  const prefix = rest.slice(0, lastSlash); // e.g. "media/movie"
  const id = rest.slice(lastSlash + 1); // e.g. "42"
  if (!id) return null;

  const rule = URI_ROUTE_MAP[prefix];
  if (rule === undefined) return null;

  return typeof rule === 'string' ? `${rule}/${id}` : rule(id, data);
}
