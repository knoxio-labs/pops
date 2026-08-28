/**
 * Covers `fetchPlexFriends` against the community GraphQL API. The REST route
 * it replaced (`https://plex.tv/api/v2/friends`) answers 410 Gone to every
 * caller, so the two things worth pinning are that the request goes to the
 * GraphQL endpoint at all, and that no failure shape — transport, GraphQL
 * `errors`, or a malformed payload — can degrade into a silent empty list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchPlexFriends } from '../friends.js';
import { PlexApiError } from '../types.js';

const TOKEN = 'sUpErSeCrEtToKeN123';

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(impl: (url: string, init: RequestInit) => Response): void {
  fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(impl(String(input), init ?? {}))
  );
  vi.stubGlobal('fetch', fetchMock);
}

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error('fetch was never called');
  return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit };
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, statusText: 'OK' });
}

function friendsPayload(users: unknown[]): unknown {
  return { data: { allFriendsV2: users.map((user) => ({ user })) } };
}

beforeEach(() => {
  stubFetch(() => jsonOk(friendsPayload([])));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPlexFriends — request', () => {
  it('POSTs the allFriendsV2 query to the community API with the token as a header', async () => {
    await fetchPlexFriends(TOKEN);
    const { url, init } = lastCall();

    expect(url).toBe('https://community.plex.tv/api');
    expect(init.method).toBe('POST');
    expect(url).not.toContain(TOKEN);
    expect((init.headers as Record<string, string>)['X-Plex-Token']).toBe(TOKEN);
    expect(String(init.body)).toContain('allFriendsV2');
  });

  it('no longer touches the retired plex.tv v2 friends route', async () => {
    await fetchPlexFriends(TOKEN);
    expect(lastCall().url).not.toContain('/api/v2/friends');
  });
});

describe('fetchPlexFriends — mapping', () => {
  it('maps the community user id to uuid and carries the name fields through', async () => {
    stubFetch(() =>
      jsonOk(
        friendsPayload([
          {
            id: 'uuid-alice',
            username: 'alice',
            displayName: 'Alice A',
            avatar: 'https://plex.tv/a.png',
          },
        ])
      )
    );

    expect(await fetchPlexFriends(TOKEN)).toEqual([
      {
        uuid: 'uuid-alice',
        username: 'alice',
        displayName: 'Alice A',
        avatar: 'https://plex.tv/a.png',
      },
    ]);
  });

  it('nulls the optional fields a managed or home user omits', async () => {
    stubFetch(() => jsonOk(friendsPayload([{ id: 'uuid-managed' }])));

    expect(await fetchPlexFriends(TOKEN)).toEqual([
      { uuid: 'uuid-managed', username: null, displayName: null, avatar: null },
    ]);
  });

  it('skips edges with no user id, since the watchlist API keys on the uuid', async () => {
    stubFetch(() =>
      jsonOk({
        data: {
          allFriendsV2: [
            null,
            { user: null },
            { user: { username: 'no-id' } },
            { user: { id: 'uuid-bob' } },
          ],
        },
      })
    );

    const friends = await fetchPlexFriends(TOKEN);
    expect(friends.map((f) => f.uuid)).toEqual(['uuid-bob']);
  });

  it('returns an empty list when the account genuinely has no friends', async () => {
    expect(await fetchPlexFriends(TOKEN)).toEqual([]);
  });
});

describe('fetchPlexFriends — failures surface', () => {
  it('throws on a transport-level error status', async () => {
    stubFetch(
      () => new Response('You must provide a token!', { status: 401, statusText: 'Unauthorized' })
    );

    const err = await fetchPlexFriends(TOKEN).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PlexApiError);
    expect((err as PlexApiError).status).toBe(401);
  });

  it('throws on a 200 that carries GraphQL errors rather than yielding no friends', async () => {
    stubFetch(() =>
      jsonOk({ data: null, errors: [{ message: 'Not authorized' }, { message: 'and again' }] })
    );

    const err = await fetchPlexFriends(TOKEN).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PlexApiError);
    expect((err as PlexApiError).message).toContain('Not authorized');
    expect((err as PlexApiError).message).toContain('and again');
  });

  it('throws when the payload has no allFriendsV2 field at all', async () => {
    stubFetch(() => jsonOk({ data: {} }));

    await expect(fetchPlexFriends(TOKEN)).rejects.toBeInstanceOf(PlexApiError);
  });
});
