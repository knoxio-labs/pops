/**
 * TheTVDB v4 API response types and error class.
 */

/** Typed error for TheTVDB API failures. */
export class TvdbApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TvdbApiError";
  }
}

/** A single search result from TheTVDB. */
export interface TvdbSearchResult {
  tvdbId: number;
  name: string;
  originalName: string | null;
  overview: string | null;
  firstAirDate: string | null;
  status: string | null;
  posterPath: string | null;
  genres: string[];
  originalLanguage: string | null;
  year: string | null;
}

/** Summary of a season within a show detail response. */
export interface TvdbSeasonSummary {
  tvdbId: number;
  seasonNumber: number;
  name: string | null;
  overview: string | null;
  imageUrl: string | null;
  episodeCount: number;
}

/** Artwork entry from TheTVDB. */
export interface TvdbArtwork {
  id: number;
  type: number;
  imageUrl: string;
  language: string | null;
  score: number;
}

/** Full show detail from TheTVDB extended endpoint. */
export interface TvdbShowDetail {
  tvdbId: number;
  name: string;
  originalName: string | null;
  overview: string | null;
  firstAirDate: string | null;
  lastAirDate: string | null;
  status: string | null;
  originalLanguage: string | null;
  averageRuntime: number | null;
  genres: { id: number; name: string }[];
  networks: { id: number; name: string }[];
  seasons: TvdbSeasonSummary[];
  artworks: TvdbArtwork[];
}

/** A single episode from TheTVDB. */
export interface TvdbEpisode {
  tvdbId: number;
  episodeNumber: number;
  seasonNumber: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  runtime: number | null;
  imageUrl: string | null;
}

// --- Raw API shapes (TheTVDB v4 responses) ---

/** Raw TheTVDB search result. */
export interface RawTvdbSearchResult {
  tvdb_id?: string;
  objectID?: string;
  name: string;
  name_translated?: Record<string, string> | null;
  aliases?: string[];
  overview?: string | null;
  overviews?: Record<string, string> | null;
  first_air_time?: string | null;
  status?: string | null;
  image_url?: string | null;
  thumbnail?: string | null;
  genres?: string[];
  primary_language?: string | null;
  year?: string | null;
}

/** Raw TheTVDB search response wrapper. */
export interface RawTvdbSearchResponse {
  status: string;
  data: RawTvdbSearchResult[];
}

/** Raw TheTVDB artwork. */
export interface RawTvdbArtwork {
  id: number;
  type: number;
  image: string;
  language: string | null;
  score: number;
}

/** Raw TheTVDB season summary within extended series. */
export interface RawTvdbSeasonSummary {
  id: number;
  number: number;
  name?: string | null;
  overview?: string | null;
  image?: string | null;
  type?: { id: number; name: string; type: string } | null;
  episodes?: unknown[] | null;
}

/** Raw TheTVDB genre/network. */
export interface RawTvdbGenre {
  id: number;
  name: string;
}

/** Raw TheTVDB extended series response. */
export interface RawTvdbSeriesExtended {
  id: number;
  name: string;
  originalName?: string | null;
  overview?: string | null;
  firstAired?: string | null;
  lastAired?: string | null;
  status?: { id: number; name: string } | null;
  originalLanguage?: string | null;
  averageRuntime?: number | null;
  genres?: RawTvdbGenre[];
  networks?: RawTvdbGenre[];
  seasons?: RawTvdbSeasonSummary[];
  artworks?: RawTvdbArtwork[];
}

/** Raw TheTVDB extended series response wrapper. */
export interface RawTvdbSeriesExtendedResponse {
  status: string;
  data: RawTvdbSeriesExtended;
}

/** Raw TheTVDB episode. */
export interface RawTvdbEpisode {
  id: number;
  number: number;
  seasonNumber: number;
  name?: string | null;
  overview?: string | null;
  aired?: string | null;
  runtime?: number | null;
  image?: string | null;
}

/** Raw TheTVDB episodes response wrapper. */
export interface RawTvdbEpisodesResponse {
  status: string;
  data: {
    series: { id: number };
    episodes: RawTvdbEpisode[];
  };
}

/** Login response from TheTVDB. */
export interface RawTvdbLoginResponse {
  status: string;
  data: {
    token: string;
  };
}
