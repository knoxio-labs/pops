/**
 * An entity's `colour` (POPS-3061) is a raw `#rrggbb` hex value assigned
 * server-side by contacts from its own fixed ten-entry palette — contacts is
 * the source of truth for which hex values exist, and this file only ever
 * renders whatever hex it is given. Unlike the design playground's fixture
 * palette, there is no id → tint/ring lookup table on the wire. `29`/`66` are
 * the nearest 8-digit hex-alpha steps to the 16%/40% alpha the design
 * system's OKLCH swatches use for tint/ring, so the fallback rendering
 * matches `EntityAvatar` while working off the hex alone.
 */
export interface EntityColourStyle {
  swatch: string;
  tint: string;
  ring: string;
}

export function entityColourStyle(
  colour: string | null | undefined
): EntityColourStyle | undefined {
  if (!colour) return undefined;
  return { swatch: colour, tint: `${colour}29`, ring: `${colour}66` };
}

/**
 * `GET /entities/{id}/avatar` is content-addressed by ENTITY id, not by the
 * blob's own asset id, so the URL is stable across a replace — the `v` query
 * param busts the browser's cache instead.
 */
export function entityAvatarUrlFor(entityId: string, avatarAssetId: string): string {
  return `/contacts-api/entities/${entityId}/avatar?v=${avatarAssetId}`;
}
