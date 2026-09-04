/**
 * `/logos/:id` is a plain Express route (raw bytes, not a ts-rest contract
 * route — see `pillars/finance/src/api/rest/serve-logo.ts`), served behind
 * the same `/finance-api` proxy path the generated client is pinned to
 * (`finance-api-runtime-config.ts`). The id is content-addressed (a
 * replacement upload always mints a new id — see the `logo_blobs` schema doc
 * comment), so the URL is safe to cache forever with no query string.
 */
export function logoUrlFor(logoAssetId: string): string {
  return `/finance-api/logos/${logoAssetId}`;
}
