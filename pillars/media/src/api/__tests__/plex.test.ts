/**
 * Integration tests for the `plex.*` REST surface (connection + auth) via
 * supertest. Both the Plex Media Server API and the plex.tv PIN endpoints
 * are mocked at `globalThis.fetch` with a (method, url-substring) route
 * table, so the assertions exercise the real client → handler → contract
 * path. Token persistence is exercised end-to-end against a fresh on-disk
 * `plex_settings` table.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openMediaDb, plexSettingsService, type OpenedMediaDb } from '../../db/index.js';
import { createMediaApiApp } from '../app.js';
import { getPlexToken } from '../clients/plex/index.js';
import { makeClient } from './test-utils.js';

const PLEX_URL = 'http://plex.test:32400';

interface RouteResponse {
  status?: number;
  body: unknown;
}
type RouteHandler = (init: { method: string; body: unknown }) => RouteResponse;
interface RouteRule {
  method: string;
  match: string;
  handler: RouteHandler;
}

interface RecordedCall {
  method: string;
  url: string;
  body: unknown;
  headers: Record<string, string>;
}

let routes: RouteRule[];
let calls: RecordedCall[];

function route(method: string, match: string, handler: RouteHandler): void {
  routes.push({ method, match, handler });
}

function requireCall(predicate: (c: RecordedCall) => boolean): RecordedCall {
  const call = calls.find(predicate);
  if (!call) throw new Error('expected an upstream Plex call but none matched');
  return call;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = (init?.method ?? 'GET').toUpperCase();
  const parsedBody: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
    headers[k.toLowerCase()] = v;
  }
  calls.push({ method, url, body: parsedBody, headers });
  const rule = routes.find((r) => r.method === method && url.includes(r.match));
  if (!rule) return Promise.resolve(jsonResponse({ error: `unmatched ${method} ${url}` }, 404));
  const res = rule.handler({ method, body: parsedBody });
  return Promise.resolve(jsonResponse(res.body, res.status ?? 200));
});

const LIBRARIES = {
  MediaContainer: {
    size: 1,
    Directory: [
      {
        key: '1',
        title: 'Movies',
        type: 'movie',
        agent: 'tv.plex.agents.movie',
        scanner: 'Plex Movie',
        language: 'en-US',
        uuid: 'lib-uuid-1',
        updatedAt: 1700000000,
        scannedAt: 1700000001,
      },
    ],
  },
};

function stubLibraries(): void {
  route('GET', '/library/sections', () => ({ body: LIBRARIES }));
}

let tmpDir: string;
let mediaDb: OpenedMediaDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-plex-test-'));
  mediaDb = openMediaDb(join(tmpDir, 'media.db'));
  routes = [];
  calls = [];
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  delete process.env['PLEX_URL'];
  delete process.env['ENCRYPTION_KEY'];
  delete process.env['PLEX_MOVIE_SECTION_ID'];
  delete process.env['PLEX_TV_SECTION_ID'];
});

afterEach(() => {
  mediaDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  delete process.env['PLEX_URL'];
  delete process.env['ENCRYPTION_KEY'];
  delete process.env['PLEX_MOVIE_SECTION_ID'];
  delete process.env['PLEX_TV_SECTION_ID'];
});

function seedConnection(): void {
  plexSettingsService.setSetting(mediaDb.db, 'plex_url', PLEX_URL);
  plexSettingsService.setSetting(mediaDb.db, 'plex_token', 'raw-token');
}

function client() {
  return makeClient(
    createMediaApiApp({ mediaDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3003' })
  );
}

describe('plex — connection', () => {
  it('409s testConnection when Plex is not configured', async () => {
    await expect(client().plex.testConnection()).rejects.toMatchObject({ status: 409 });
  });

  it('testConnection returns connected:true when libraries load', async () => {
    seedConnection();
    stubLibraries();
    const res = await client().plex.testConnection();
    expect(res.data).toEqual({ connected: true });
    const call = requireCall((c) => c.url.includes('/library/sections'));
    expect(call.headers['x-plex-token']).toBe('raw-token');
    expect(call.url).not.toContain('raw-token');
  });

  it('testConnection returns connected:false when the server errors', async () => {
    seedConnection();
    route('GET', '/library/sections', () => ({ status: 500, body: { error: 'boom' } }));
    const res = await client().plex.testConnection();
    expect(res.data.connected).toBe(false);
  });

  it('getLibraries maps the directory entries', async () => {
    seedConnection();
    stubLibraries();
    const { data } = await client().plex.getLibraries();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ key: '1', title: 'Movies', type: 'movie' });
  });

  it('getPlexUrl reads the persisted value, then env, else null', async () => {
    expect((await client().plex.getPlexUrl()).data).toBeNull();
    process.env['PLEX_URL'] = 'http://env-plex:32400';
    expect((await client().plex.getPlexUrl()).data).toBe('http://env-plex:32400');
    plexSettingsService.setSetting(mediaDb.db, 'plex_url', PLEX_URL);
    expect((await client().plex.getPlexUrl()).data).toBe(PLEX_URL);
  });

  it('getPlexUrl normalises a schemeless persisted value and a schemeless env fallback', async () => {
    process.env['PLEX_URL'] = 'env-plex:32400';
    expect((await client().plex.getPlexUrl()).data).toBe('http://env-plex:32400');
    plexSettingsService.setSetting(mediaDb.db, 'plex_url', 'plex.test:32400/');
    expect((await client().plex.getPlexUrl()).data).toBe('http://plex.test:32400/');
  });

  it('getPlexUrl reports null for an unparseable persisted value', async () => {
    plexSettingsService.setSetting(mediaDb.db, 'plex_url', ':');
    expect((await client().plex.getPlexUrl()).data).toBeNull();
    expect((await client().plex.getSyncStatus()).data.hasUrl).toBe(false);
  });

  it('a schemeless plex_url written outside setUrl still produces a working client', async () => {
    plexSettingsService.setSetting(mediaDb.db, 'plex_url', 'plex.test:32400');
    plexSettingsService.setSetting(mediaDb.db, 'plex_token', 'raw-token');
    stubLibraries();
    const { data } = await client().plex.getLibraries();
    expect(data).toHaveLength(1);
    expect(requireCall((c) => c.url.includes('/library/sections')).url).toMatch(
      /^http:\/\/plex\.test:32400\/library\/sections/
    );
  });

  it('setUrl validates against the live server and persists a normalised URL', async () => {
    plexSettingsService.setSetting(mediaDb.db, 'plex_token', 'raw-token');
    stubLibraries();
    const res = await client().plex.setUrl('plex.test:32400');
    expect(res.message).toContain('updated');
    expect(plexSettingsService.getSetting(mediaDb.db, 'plex_url')).toBe('http://plex.test:32400');
  });

  it('setUrl 409s when validation fails', async () => {
    plexSettingsService.setSetting(mediaDb.db, 'plex_token', 'raw-token');
    route('GET', '/library/sections', () => ({ status: 401, body: { error: 'unauthorised' } }));
    await expect(client().plex.setUrl('plex.test:32400')).rejects.toMatchObject({ status: 409 });
    expect(plexSettingsService.getSetting(mediaDb.db, 'plex_url')).toBeNull();
  });

  it('setUrl probes /identity (reachability) when no token is stored', async () => {
    route('GET', '/identity', () => ({ body: { MediaContainer: {} } }));
    const res = await client().plex.setUrl('plex.test:32400');
    expect(res.message).toContain('updated');
    requireCall((c) => c.url.includes('/identity'));
  });

  it('getPlexUsername reads the persisted username', async () => {
    expect((await client().plex.getPlexUsername()).data).toBeNull();
    plexSettingsService.setSetting(mediaDb.db, 'plex_username', 'alice');
    expect((await client().plex.getPlexUsername()).data).toBe('alice');
  });

  it('getSyncStatus reflects configured/url/token presence', async () => {
    const empty = await client().plex.getSyncStatus();
    expect(empty.data).toEqual({ configured: false, hasUrl: false, hasToken: false });
    seedConnection();
    const configured = await client().plex.getSyncStatus();
    expect(configured.data).toEqual({ configured: true, hasUrl: true, hasToken: true });
  });

  it('getSyncStatus carries no liveness field that could contradict testConnection', async () => {
    seedConnection();
    stubLibraries();
    const status = await client().plex.getSyncStatus();
    expect(Object.keys(status.data)).not.toContain('connected');
    expect(calls).toHaveLength(0);
    expect((await client().plex.testConnection()).data.connected).toBe(true);
  });
});

describe('plex — section ids', () => {
  it('round-trips section ids through plex_settings', async () => {
    expect((await client().plex.getSectionIds()).data).toEqual({
      movieSectionId: null,
      tvSectionId: null,
    });
    await client().plex.saveSectionIds({ movieSectionId: '1', tvSectionId: '2' });
    expect((await client().plex.getSectionIds()).data).toEqual({
      movieSectionId: '1',
      tvSectionId: '2',
    });
  });

  it('falls back to env section ids when unset', async () => {
    process.env['PLEX_MOVIE_SECTION_ID'] = '9';
    expect((await client().plex.getSectionIds()).data.movieSectionId).toBe('9');
  });
});

describe('plex — auth (plex.tv PIN flow)', () => {
  it('getAuthPin creates a PIN and persists a stable client identifier', async () => {
    route('POST', 'plex.tv/api/v2/pins', () => ({ body: { id: 4242, code: 'ABCD' } }));
    const res = await client().plex.getAuthPin();
    expect(res.data).toMatchObject({ id: 4242, code: 'ABCD' });
    expect(res.data.clientId).toMatch(/[0-9a-f-]{36}/);

    const persisted = plexSettingsService.getSetting(mediaDb.db, 'plex_client_identifier');
    expect(persisted).toBe(res.data.clientId);

    const second = await client().plex.getAuthPin();
    expect(second.data.clientId).toBe(res.data.clientId);
  });

  it('checkAuthPin encrypts + persists the token and returns connected', async () => {
    route('GET', 'plex.tv/api/v2/pins/55', () => ({
      body: { id: 55, code: 'X', authToken: 'secret-plex-token', username: 'bob' },
    }));
    const res = await client().plex.checkAuthPin(55);
    expect(res.data).toEqual({ connected: true, username: 'bob' });

    const stored = plexSettingsService.getSetting(mediaDb.db, 'plex_token');
    expect(stored).not.toBeNull();
    expect(stored).not.toBe('secret-plex-token');
    expect(getPlexToken(mediaDb.db)).toBe('secret-plex-token');
    expect(plexSettingsService.getSetting(mediaDb.db, 'plex_username')).toBe('bob');
  });

  it('checkAuthPin reports not-yet-authorised without persisting', async () => {
    route('GET', 'plex.tv/api/v2/pins/55', () => ({ body: { id: 55, code: 'X' } }));
    const res = await client().plex.checkAuthPin(55);
    expect(res.data).toEqual({ connected: false, expired: false });
    expect(plexSettingsService.getSetting(mediaDb.db, 'plex_token')).toBeNull();
  });

  it('checkAuthPin reports expired PINs', async () => {
    route('GET', 'plex.tv/api/v2/pins/55', () => ({
      body: { id: 55, code: 'X', expiresAt: new Date(Date.now() - 1000).toISOString() },
    }));
    const res = await client().plex.checkAuthPin(55);
    expect(res.data).toEqual({ connected: false, expired: true });
  });

  it('checkAuthPin 404s an unknown PIN', async () => {
    route('GET', 'plex.tv/api/v2/pins/999', () => ({ status: 404, body: { error: 'not found' } }));
    await expect(client().plex.checkAuthPin(999)).rejects.toMatchObject({ status: 404 });
  });

  it('disconnect clears the token + username', async () => {
    plexSettingsService.setSetting(mediaDb.db, 'plex_token', 'enc');
    plexSettingsService.setSetting(mediaDb.db, 'plex_username', 'bob');
    const res = await client().plex.disconnect();
    expect(res.message).toContain('Disconnected');
    expect(plexSettingsService.getSetting(mediaDb.db, 'plex_token')).toBeNull();
    expect(plexSettingsService.getSetting(mediaDb.db, 'plex_username')).toBeNull();
  });

  it('400s a checkAuthPin call missing the id at the contract boundary', async () => {
    await expect(client().plex.checkAuthPin(Number.NaN)).rejects.toMatchObject({ status: 400 });
  });
});
