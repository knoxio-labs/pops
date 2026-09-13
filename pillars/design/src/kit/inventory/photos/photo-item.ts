/**
 * One photo as the gallery, the lightbox and the strip all read it.
 *
 * Its own module so the leaf components can name it without importing their
 * parent. The app has each leaf import the type from the component that
 * renders it, which costs it a circular dependency per pair (all six sit in
 * `.dependency-cruiser-known-violations.json`).
 */

export interface PhotoItem {
  id: number;
  /**
   * Resolved photo URL. The app derives this from a `filePath` and a
   * `baseUrl` API route (`/api/inventory/photos/…`); the kit takes the
   * resolved URL directly since the canvas has no backend to route through.
   */
  url: string;
  caption: string | null;
  sortOrder: number;
}
