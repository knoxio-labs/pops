# ADR-009: Local Image Caching

## Status

Accepted (2026-03-20)

## Context

The media app displays poster and backdrop images for movies and TV shows. These images originate from TMDB (movies) and TheTVDB (TV shows). We need to decide how to serve them to the frontend.

### Options Considered

**A. Proxy external URLs**

The frontend requests images directly from TMDB/TheTVDB image CDNs. The API returns external image URLs in metadata responses.

- Pros: Zero disk usage, no caching infrastructure, always up-to-date images, simplest implementation
- Cons: Runtime dependency on external CDNs — if TMDB/TheTVDB is down, no images render. Latency on every image load (CDN round-trip). No offline access. Every page view hits external servers. TMDB image CDN has no strict rate limit but does throttle abusive patterns.

**B. Download and cache locally**

On first access (or when adding to library), download poster/backdrop images to local disk. Serve via an API endpoint. Frontend requests images from the POPS API, never from external CDNs.

- Pros: Zero external dependency at render time — images serve from local disk. Fast (local network, no CDN round-trip). Works offline. Images persist even if the external API changes URLs or removes content. Full control over caching headers.
- Cons: Disk usage (~1 GB for a large library of 2,500 movies + shows). Need to manage storage directory, serve static files, handle cache invalidation on metadata refresh.

**C. CDN proxy with local fallback**

Frontend requests from external CDN first, with a service worker caching images locally for offline use.

- Pros: Combines CDN freshness with offline capability
- Cons: Complex — two caching layers (service worker + CDN), cache invalidation is harder, service worker adds mobile complexity, first load still depends on external CDN.

## Decision

**Option B: Download and cache locally.**

The disk cost (~1 GB) is trivial for the N95. The benefits are significant:

1. **No render-time dependency** — The media library page with 50 poster thumbnails makes zero external requests. All images serve from local disk over the local network.
2. **Offline-capable** — The PWA can display the full library with images when the internet is down.
3. **Consistent performance** — No variable latency from CDN round-trips. Local network is consistently fast.
4. **Durability** — If TMDB or TheTVDB changes image URLs or removes content, cached images persist.

For a self-hosted single-user system on local hardware, local storage is the obvious choice. The CDN proxy approach solves a problem (bandwidth, storage costs) that doesn't exist here.

### Image types

Three image types are cached per media item, sourced from TMDB (movies) and TheTVDB (TV):

| Type | Aspect ratio | Usage | Source |
|------|-------------|-------|--------|
| **Poster** | Portrait (2:3) | Grid cards, list items, comparison arena, detail sidebar | TMDB/TheTVDB poster |
| **Backdrop** | Landscape (16:9) | Hero banners, detail page backgrounds, wide cards | TMDB/TheTVDB backdrop/fanart |
| **Logo** | Varies (transparent PNG) | Title treatment overlaid on backdrops | TMDB/TheTVDB logo (where available) |

Not every item will have all three. Posters are nearly universal. Backdrops are common. Logos are less reliably available — the fallback is text-rendered title over the backdrop.

Different UI layouts (Netflix-style wide cards, Plex-style tall cards, square cards, list thumbnails) are CSS concerns, not image concerns. A portrait poster in a wide container uses `object-fit: cover` to crop. No server-side cropping or resizing needed.

### Image sizes

Cache originals only (typically 780px posters, 1280px backdrops). No server-side resizing or thumbnail generation for v1. Single user on a local network — serving a 780px image for a 150px card is ~200KB of wasted transfer over localhost. Imperceptible. If list page performance ever becomes an issue, add thumbnail generation with sharp/libvips as a future enhancement.

### Storage details

- Images stored in a configurable directory (e.g., `/data/media/images/`)
- Organised by media type and ID:
  ```
  movies/{tmdb_id}/poster.jpg
  movies/{tmdb_id}/backdrop.jpg
  movies/{tmdb_id}/logo.png
  movies/{tmdb_id}/override.jpg
  tv/{tvdb_id}/poster.jpg
  tv/{tvdb_id}/backdrop.jpg
  tv/{tvdb_id}/logo.png
  tv/{tvdb_id}/override.jpg
  ```
- Served via an API endpoint (`/media/images/:type/:id/:filename`) with cache headers
- Downloaded on "add to library" — not lazily on first frontend request
- Metadata refresh can optionally re-download if the source image has changed

### Image resolution chain

The image serving endpoint resolves which image to return in this order:

1. **User override** — if a `poster_override_path` exists on the record, serve that. The user can upload a custom poster via the detail page (e.g., a preferred fan poster, alternate region artwork, or a correction for a wrong match).
2. **Cached local image** — the downloaded poster from TMDB/TheTVDB.
3. **On-demand fetch** — if the cache is missing (e.g., download failed on add), attempt to fetch from the source API and cache it.
4. **Generated placeholder** — if the source has no image (obscure titles, new releases), generate a placeholder: title + year rendered on a solid background with a genre-derived colour. Never serve a broken image.

### User override

`movies` and `tv_shows` tables include an optional `poster_override_path TEXT` column. When set, the image endpoint serves the override instead of the cached source image. Overrides are uploaded via the media detail page and stored alongside cached images in the poster directory (e.g., `movies/{tmdb_id}/override.jpg`). Clearing the override reverts to the cached source image.

## Consequences

- ~1.5 GB disk budget for a full library (2,500 movies + 100 TV shows × poster + backdrop + logo where available)
- Images download once on add-to-library, then serve locally forever
- The API needs a static file serving endpoint with appropriate cache headers
- Poster storage directory must be included in the backup strategy (rclone to Backblaze B2)
- Adding a movie/show has a slight delay for the image download (200–500ms per image) — acceptable as a background operation during the "add to library" flow
- No broken images in the UI — the fallback chain guarantees every media item has something to display
- User overrides are optional and per-item — they don't interfere with the cache or metadata refresh
