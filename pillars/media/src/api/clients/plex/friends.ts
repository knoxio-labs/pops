/**
 * Plex friends API — fetches the friends list and friend watchlists from the
 * Plex community + Discover APIs.
 *
 * Ported from the monolith `media/plex/friends.ts`. Standalone (token /
 * clientId args) rather than `PlexClient` methods because these endpoints live
 * on the Plex cloud, not the local Media Server.
 *
 * The friends list comes from the GraphQL community API. The REST route it
 * used to use, `https://plex.tv/api/v2/friends`, now answers 410 Gone to every
 * caller, authenticated or not — Plex retired it when the social graph moved
 * to GraphQL.
 *
 * Limitations:
 * - Friend watchlists are only accessible when the friend's watchlist
 *   visibility is "friends" or "public" on Plex.
 * - The Plex community API requires the user's own token; it cannot
 *   impersonate friends. We access shared/public watchlists only.
 */
import { getAbsolute, postAbsolute } from './client-http.js';
import { PlexApiError } from './types.js';

const PLEX_COMMUNITY_API = 'https://community.plex.tv/api';

/**
 * A Plex friend. `uuid` is the account UUID the Discover watchlist API expects
 * as its `uri=server://<uuid>/…` selector; the two name fields are both
 * optional on Plex's side (managed and home users can have neither), so a
 * display label has to fall back through them to the uuid.
 */
export interface PlexFriend {
  uuid: string;
  username: string | null;
  displayName: string | null;
  avatar: string | null;
}

interface RawCommunityUser {
  id?: string | null;
  username?: string | null;
  displayName?: string | null;
  avatar?: string | null;
}

interface AllFriendsResponse {
  data?: { allFriendsV2?: Array<{ user?: RawCommunityUser | null } | null> | null } | null;
  errors?: Array<{ message?: string }> | null;
}

const ALL_FRIENDS_QUERY = `query GetAllFriends {
  allFriendsV2 {
    user {
      id
      username
      displayName
      avatar
    }
  }
}`;

interface PlexCommunityWatchlistItem {
  ratingKey: string;
  type: string;
  title: string;
  year?: number;
  Guid?: Array<{ id: string }>;
}

/**
 * Fetch the user's Plex friends from the community GraphQL API (requires the
 * user's own token).
 *
 * GraphQL answers 200 with an `errors` array for failures the transport cannot
 * see, so those are re-raised as a `PlexApiError` rather than silently
 * yielding an empty friends list.
 */
export async function fetchPlexFriends(token: string): Promise<PlexFriend[]> {
  const body = await postAbsolute<AllFriendsResponse>(
    PLEX_COMMUNITY_API,
    { query: ALL_FRIENDS_QUERY },
    { auth: { token }, context: 'Plex friends API' }
  );

  const errors = body.errors;
  if (errors && errors.length > 0) {
    const detail = errors.map((e) => e.message ?? 'unknown error').join('; ');
    throw new PlexApiError(502, `Plex friends API error: ${detail}`);
  }

  const edges = body.data?.allFriendsV2;
  if (!edges) {
    throw new PlexApiError(502, 'Plex friends API error: response contained no allFriendsV2 field');
  }

  const friends: PlexFriend[] = [];
  for (const edge of edges) {
    const user = edge?.user;
    if (!user?.id) continue;
    friends.push({
      uuid: user.id,
      username: user.username ?? null,
      displayName: user.displayName ?? null,
      avatar: user.avatar ?? null,
    });
  }
  return friends;
}

const PLEX_DISCOVER_BASE = 'https://discover.provider.plex.tv';
const PAGE_SIZE = 50;

interface PlexWatchlistResponse {
  MediaContainer: {
    totalSize?: number;
    Metadata?: PlexCommunityWatchlistItem[];
  };
}

export interface FriendWatchlistInput {
  token: string;
  clientId: string;
  friendUuid: string;
}

interface PageRequest extends FriendWatchlistInput {
  start: number;
  size: number;
}

/** A movie pulled from a friend's watchlist (only movies with a TMDB GUID). */
export interface FriendWatchlistMovie {
  tmdbId: number;
  title: string;
  year: number | null;
}

function collectMovieItems(pageItems: PlexCommunityWatchlistItem[]): FriendWatchlistMovie[] {
  const out: FriendWatchlistMovie[] = [];
  for (const item of pageItems) {
    if (item.type !== 'movie') continue;
    const tmdbId = extractTmdbIdFromGuids(item.Guid);
    if (!tmdbId) continue;
    out.push({ tmdbId, title: item.title, year: item.year ?? null });
  }
  return out;
}

async function fetchFriendWatchlistPage(req: PageRequest): Promise<PlexWatchlistResponse> {
  const { token, clientId, friendUuid, start, size } = req;
  const url =
    `${PLEX_DISCOVER_BASE}/library/sections/watchlist/all` +
    `?X-Plex-Container-Start=${start}` +
    `&X-Plex-Container-Size=${size}` +
    `&includeGuids=1` +
    `&uri=server%3A%2F%2F${friendUuid}%2Fcom.plexapp.plugins.library`;

  return getAbsolute<PlexWatchlistResponse>(url, {
    auth: { token, clientId },
    context: 'Plex friend watchlist API',
  });
}

/**
 * Fetch a friend's watchlist via the Plex Discover API (paginated). Returns an
 * empty array when the watchlist is private or inaccessible (401/403/404).
 */
export async function fetchFriendWatchlist(
  input: FriendWatchlistInput
): Promise<FriendWatchlistMovie[]> {
  const items: FriendWatchlistMovie[] = [];
  let start = 0;

  for (;;) {
    let data: PlexWatchlistResponse;
    try {
      data = await fetchFriendWatchlistPage({ ...input, start, size: PAGE_SIZE });
    } catch (err) {
      if (err instanceof PlexApiError && [401, 403, 404].includes(err.status)) return [];
      throw err;
    }

    const pageItems = data.MediaContainer.Metadata ?? [];
    items.push(...collectMovieItems(pageItems));

    if (pageItems.length < PAGE_SIZE) break;
    start += pageItems.length;
    const totalSize = data.MediaContainer.totalSize;
    if (totalSize !== undefined && start >= totalSize) break;
  }

  return items;
}

/** Extract a TMDB ID from a Plex Guid array (entries look like `tmdb://27205`). */
function extractTmdbIdFromGuids(guids: Array<{ id: string }> | undefined): number | null {
  if (!guids) return null;
  for (const g of guids) {
    const match = g.id.match(/^tmdb:\/\/(\d+)$/);
    if (match) return Number(match[1]);
  }
  return null;
}
