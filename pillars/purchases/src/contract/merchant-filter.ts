/**
 * The merchant a read is scoped to, and the query parameters that name one.
 *
 * This is the filter counterpart of `MerchantIdentity`, the roll-up's output:
 * every group `GET /analytics/merchant-spend` returns must be nameable here,
 * or the one view built around merchants is the one view that cannot open a
 * merchant's orders. The two are exhaustive over the same
 * {@link MerchantResolution} vocabulary, asserted rather than assumed.
 *
 * A union rather than three loose fields because `resolution` constrains the
 * value rather than describing it: there is no such thing as an entity filter
 * without an entity id, and flattening the three would let one be built.
 */
export type MerchantFilter =
  | { readonly resolution: 'entity'; readonly entityId: string }
  | { readonly resolution: 'name'; readonly name: string }
  | { readonly resolution: 'unattributed' };

/** The merchant parameters of the order index, as they arrive off the wire. */
export interface MerchantFilterQuery {
  readonly merchantEntityId?: string | undefined;
  readonly merchantEntityName?: string | undefined;
  readonly merchantUnattributed?: boolean | undefined;
}

/**
 * The parameter names, in the order a refusal lists them, so the message a
 * caller reads names the same strings it sent.
 */
export const MERCHANT_FILTER_PARAMETERS = [
  'merchantEntityId',
  'merchantEntityName',
  'merchantUnattributed',
] as const;

export type MerchantFilterResolution =
  | { readonly ok: true; readonly merchant: MerchantFilter | undefined }
  | { readonly ok: false; readonly conflicting: readonly string[] };

/**
 * Which merchant group a query selects, or a refusal naming the parameters
 * that fought.
 *
 * `merchantUnattributed=false` engages nothing. It is the absence of a
 * request for the unattributed bucket, not a request to exclude it, so it
 * neither filters nor conflicts — a client that sends its checkbox state
 * unconditionally must not thereby forbid the other two parameters.
 *
 * Anything else combining two parameters is refused rather than intersected.
 * `merchantEntityId=e1&merchantEntityName=Amazon` reads like a narrowing and
 * is not one: a `name` group holds exactly the orders carrying no entity at
 * all, so the intersection is empty by construction and would answer a
 * plainly-meant question with a confident zero.
 */
export function resolveMerchantFilter(query: MerchantFilterQuery): MerchantFilterResolution {
  const engaged = [
    ...(query.merchantEntityId === undefined ? [] : ['merchantEntityId' as const]),
    ...(query.merchantEntityName === undefined ? [] : ['merchantEntityName' as const]),
    ...(query.merchantUnattributed === true ? ['merchantUnattributed' as const] : []),
  ];

  if (engaged.length > 1) return { ok: false, conflicting: engaged };

  if (query.merchantEntityId !== undefined) {
    return { ok: true, merchant: { resolution: 'entity', entityId: query.merchantEntityId } };
  }
  if (query.merchantEntityName !== undefined) {
    return { ok: true, merchant: { resolution: 'name', name: query.merchantEntityName } };
  }
  if (query.merchantUnattributed === true) {
    return { ok: true, merchant: { resolution: 'unattributed' } };
  }
  return { ok: true, merchant: undefined };
}
