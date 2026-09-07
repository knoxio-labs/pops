/**
 * `GET /entities/:id/avatar` is a plain byte-serving route on the contacts
 * pillar (not part of its ts-rest-generated JSON contract), reached through
 * the same `/contacts-api` proxy path the generated contacts client is
 * pinned to (`contacts-api-runtime-config.ts`). Unlike finance's own
 * `logoUrlFor` (`logo-url.ts`), the asset id alone is not enough to build a
 * cache-forever URL — an avatar upload replaces the entity's avatar in place
 * rather than minting a new id — so the URL is keyed on the entity id, not
 * the asset id, and callers should not assume it is safe to cache
 * indefinitely across an avatar change.
 */
export function avatarUrlFor(entityId: string): string {
  return `/contacts-api/entities/${entityId}/avatar`;
}
