import { getSonarrClient } from './config.js';
import { clearAllStatusCaches } from './status-cache.js';

/**
 * Sonarr calendar + series/season/episode operations.
 *
 * Calendar lookups carry a 5-minute module cache. Mutations clear the
 * status caches and the per-client GET cache so subsequent reads are fresh.
 */
import type { MediaDb } from '../../../db/index.js';
import type { SonarrClient } from './sonarr-client.js';
import type {
  CalendarEpisode,
  SonarrAddSeriesInput,
  SonarrCalendarEpisode,
  SonarrCheckResult,
  SonarrCommandResponse,
  SonarrEpisode,
  SonarrLanguageProfile,
  SonarrQualityProfile,
  SonarrRootFolder,
  SonarrSeriesFull,
} from './types.js';

const CALENDAR_CACHE_TTL_MS = 5 * 60 * 1000;

interface CalendarCacheEntry {
  episodes: CalendarEpisode[];
  expiresAt: number;
}

const calendarCache = new Map<string, CalendarCacheEntry>();

function mapCalendarEpisode(ep: SonarrCalendarEpisode): CalendarEpisode {
  const poster = ep.series.images.find((img) => img.coverType === 'poster');
  return {
    id: ep.id,
    seriesId: ep.seriesId,
    seriesTitle: ep.series.title,
    tvdbId: ep.series.tvdbId,
    episodeTitle: ep.title,
    seasonNumber: ep.seasonNumber,
    episodeNumber: ep.episodeNumber,
    airDateUtc: ep.airDateUtc,
    hasFile: ep.hasFile,
    posterUrl: poster?.remoteUrl ?? poster?.url ?? null,
  };
}

/** Require a configured Sonarr client; throws "Sonarr not configured" otherwise. */
function requireSonarr(db: MediaDb): SonarrClient {
  const client = getSonarrClient(db);
  if (!client) throw new Error('Sonarr not configured');
  return client;
}

/** Get upcoming episodes from Sonarr calendar with 5-min cache. */
export async function getSonarrCalendar(
  db: MediaDb,
  start: string,
  end: string
): Promise<CalendarEpisode[]> {
  const cacheKey = `${start}:${end}`;
  const cached = calendarCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.episodes;
  }

  const client = getSonarrClient(db);
  if (!client) return [];

  try {
    const raw = await client.getCalendar(start, end);
    const episodes = raw.map(mapCalendarEpisode);
    calendarCache.set(cacheKey, { episodes, expiresAt: Date.now() + CALENDAR_CACHE_TTL_MS });
    return episodes;
  } catch (err) {
    console.warn('Sonarr calendar fetch failed:', err instanceof Error ? err.message : err);
    if (cached) return cached.episodes;
    return [];
  }
}

/** Check if a series exists in Sonarr by TVDB ID. */
export async function checkSeries(db: MediaDb, tvdbId: number): Promise<SonarrCheckResult> {
  const client = getSonarrClient(db);
  if (!client) return { exists: false };
  return client.checkSeries(tvdbId);
}

/** Update season monitoring for a series in Sonarr. */
export async function updateSeasonMonitoring(
  db: MediaDb,
  sonarrId: number,
  seasonNumber: number,
  monitored: boolean
): Promise<SonarrSeriesFull> {
  const client = requireSonarr(db);
  const result = await client.updateSeasonMonitoring(sonarrId, seasonNumber, monitored);
  clearAllStatusCaches();
  client.clearCache();
  return result;
}

/** Batch update episode monitoring in Sonarr. */
export async function updateEpisodeMonitoring(
  db: MediaDb,
  episodeIds: number[],
  monitored: boolean
): Promise<void> {
  const client = requireSonarr(db);
  await client.updateEpisodeMonitoring(episodeIds, monitored);
  clearAllStatusCaches();
  client.clearCache();
}

/** Get episodes for a series from Sonarr, optionally filtered by season. */
export async function getSeriesEpisodes(
  db: MediaDb,
  sonarrId: number,
  seasonNumber?: number
): Promise<SonarrEpisode[]> {
  const client = requireSonarr(db);
  return client.getEpisodes(sonarrId, seasonNumber);
}

/** Get Sonarr quality profiles. */
export async function getSonarrQualityProfiles(db: MediaDb): Promise<SonarrQualityProfile[]> {
  return requireSonarr(db).getQualityProfiles();
}

/** Get Sonarr root folders. */
export async function getSonarrRootFolders(db: MediaDb): Promise<SonarrRootFolder[]> {
  return requireSonarr(db).getRootFolders();
}

/** Get Sonarr language profiles. */
export async function getSonarrLanguageProfiles(db: MediaDb): Promise<SonarrLanguageProfile[]> {
  return requireSonarr(db).getLanguageProfiles();
}

/** Add a series to Sonarr. */
export async function addSeries(
  db: MediaDb,
  input: SonarrAddSeriesInput
): Promise<SonarrSeriesFull> {
  const client = requireSonarr(db);
  const result = await client.addSeries(input);
  clearAllStatusCaches();
  client.clearCache();
  return result;
}

/** Update whole-series monitoring flag. */
export async function updateSeriesMonitoring(
  db: MediaDb,
  sonarrId: number,
  monitored: boolean
): Promise<SonarrSeriesFull> {
  const client = requireSonarr(db);
  const result = await client.updateMonitoring(sonarrId, monitored);
  clearAllStatusCaches();
  client.clearCache();
  return result;
}

/** Trigger a search for a series or season. */
export async function triggerSeriesSearch(
  db: MediaDb,
  sonarrId: number,
  seasonNumber?: number
): Promise<SonarrCommandResponse> {
  return requireSonarr(db).triggerSearch(sonarrId, seasonNumber);
}

/** Reset the calendar cache. */
export function clearCalendarCache(): void {
  calendarCache.clear();
}
