import { TheTvdbAuth } from './auth.js';
import { TheTvdbClient } from './client.js';
import { requireEnv } from '../../../env.js';

export { TheTvdbAuth, TheTvdbClient };
export { TvdbApiError } from './types.js';
export { refreshTvShow } from './service.js';
export type { RefreshTvShowInput, RefreshTvShowResult } from './service.js';
export type {
  TvdbSearchResult,
  TvdbShowDetail,
  TvdbSeasonSummary,
  TvdbArtwork,
  TvdbEpisode,
} from './types.js';

/**
 * Validate that THETVDB_API_KEY is configured.
 * Call at startup to fail fast with a clear error.
 */
export function validateTvdbConfig(): void {
  requireEnv('THETVDB_API_KEY');
}

/**
 * Shared TheTVDB client singleton — reuses JWT token across requests.
 * Throws if THETVDB_API_KEY is not set (checks Docker secrets then env vars).
 */
let _tvdbClient: TheTvdbClient | null = null;

export function getTvdbClient(): TheTvdbClient {
  if (_tvdbClient) return _tvdbClient;
  const apiKey = requireEnv('THETVDB_API_KEY');
  _tvdbClient = new TheTvdbClient(new TheTvdbAuth(apiKey));
  return _tvdbClient;
}

/** Reset the shared client (for testing). */
export function setTvdbClient(client: TheTvdbClient | null): void {
  _tvdbClient = client;
}
