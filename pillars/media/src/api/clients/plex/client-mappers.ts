/**
 * RawPlex* → mapped domain type converters (no I/O).
 */
import {
  type PlexEpisode,
  type PlexExternalId,
  type PlexMediaItem,
  type RawPlexEpisode,
  type RawPlexMediaItem,
} from './types.js';

/** Parse a Plex `Guid` array into structured external IDs. */
export function parseGuids(guids: RawPlexMediaItem['Guid'] | undefined): PlexExternalId[] {
  if (!guids) return [];
  return guids
    .map((g) => {
      const match = g.id.match(/^(\w+):\/\/(.+)$/);
      if (!match) return null;
      return { source: match[1], id: match[2] };
    })
    .filter((id): id is PlexExternalId => id !== null);
}

/**
 * Absent Plex scalars become `null` rather than staying absent, so a
 * `PlexMediaItem` is always fully populated.
 *
 * Written out rather than looped over a list of `[outKey, rawKey]` pairs: the
 * loop cannot be type-checked — `outKey` and `rawKey` are independent unions,
 * so TypeScript has to consider every pairing, not the one the tuple actually
 * holds — and the cast that made it compile was hiding the six places where
 * the two names differ (POPS-3029).
 */
function orNull<T>(value: T | undefined): T | null {
  return value ?? null;
}

function readScalars(raw: RawPlexMediaItem): Partial<PlexMediaItem> {
  return {
    originalTitle: orNull(raw.originalTitle),
    summary: orNull(raw.summary),
    tagline: orNull(raw.tagline),
    year: orNull(raw.year),
    thumbUrl: orNull(raw.thumb),
    artUrl: orNull(raw.art),
    durationMs: orNull(raw.duration),
    lastViewedAt: orNull(raw.lastViewedAt),
    rating: orNull(raw.rating),
    audienceRating: orNull(raw.audienceRating),
    contentRating: orNull(raw.contentRating),
    leafCount: orNull(raw.leafCount),
    viewedLeafCount: orNull(raw.viewedLeafCount),
    childCount: orNull(raw.childCount),
  };
}

export function mapMediaItem(raw: RawPlexMediaItem): PlexMediaItem {
  const base: PlexMediaItem = {
    ratingKey: raw.ratingKey,
    type: raw.type,
    title: raw.title,
    addedAt: raw.addedAt,
    updatedAt: raw.updatedAt,
    viewCount: raw.viewCount ?? 0,
    viewOffsetMs: raw.viewOffset ?? null,
    externalIds: parseGuids(raw.Guid),
    genres: (raw.Genre ?? []).map((g) => g.tag),
    directors: (raw.Director ?? []).map((d) => d.tag),
    originalTitle: null,
    summary: null,
    tagline: null,
    year: null,
    thumbUrl: null,
    artUrl: null,
    durationMs: null,
    lastViewedAt: null,
    rating: null,
    audienceRating: null,
    contentRating: null,
    leafCount: null,
    viewedLeafCount: null,
    childCount: null,
  };
  return { ...base, ...readScalars(raw) };
}

export function mapEpisode(raw: RawPlexEpisode): PlexEpisode {
  return {
    ratingKey: raw.ratingKey,
    title: raw.title,
    episodeIndex: raw.index,
    seasonIndex: raw.parentIndex,
    summary: raw.summary ?? null,
    thumbUrl: raw.thumb ?? null,
    durationMs: raw.duration ?? null,
    addedAt: raw.addedAt,
    updatedAt: raw.updatedAt,
    lastViewedAt: raw.lastViewedAt ?? null,
    viewCount: raw.viewCount ?? 0,
  };
}
