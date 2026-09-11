/**
 * Guards the `plexManifest` `envFallback` declarations against the resolvers
 * in `service.ts`: a field declares `envFallback` if and only if its getter
 * actually falls back to that env var. Reuses the shape of
 * `clients/arr/__tests__/config.test.ts` (stored-over-env resolution
 * against a real on-disk db) plus a manifest cross-check, so a declaration
 * that drifts from the resolver — in either direction — fails here rather
 * than silently mislabelling the settings UI (POPS-2556).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { plexManifest } from '../../../../contract/settings/plex-manifest.js';
import {
  openMediaDb,
  plexSettingsService,
  type MediaDb,
  type OpenedMediaDb,
} from '../../../../db/index.js';
import { PLEX_KEYS } from '../keys.js';
import { getPlexSectionIds, getPlexToken, getPlexUrl } from '../service.js';

const PLEX_ENV = ['PLEX_URL', 'PLEX_TOKEN', 'PLEX_MOVIE_SECTION_ID', 'PLEX_TV_SECTION_ID'] as const;

let tmpDir: string;
let opened: OpenedMediaDb;
let db: MediaDb;

function clearPlexEnv(): void {
  for (const name of PLEX_ENV) delete process.env[name];
}

function fieldByKey(key: string): { envFallback?: string } {
  for (const group of plexManifest.groups) {
    const field = group.fields.find((f) => f.key === key);
    if (field) return field;
  }
  throw new Error(`plexManifest has no field '${key}'`);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-plex-settings-env-fallback-test-'));
  opened = openMediaDb(join(tmpDir, 'media.db'));
  db = opened.db;
  clearPlexEnv();
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  clearPlexEnv();
});

describe('plex_url', () => {
  it('declares envFallback: PLEX_URL, matching getPlexUrl', () => {
    expect(fieldByKey(PLEX_KEYS.url).envFallback).toBe('PLEX_URL');
  });

  it('falls back to PLEX_URL when nothing is stored', () => {
    process.env['PLEX_URL'] = 'http://plex.env:32400';
    expect(getPlexUrl(db)).toBe('http://plex.env:32400');
  });

  it('prefers a stored value over the env default', () => {
    process.env['PLEX_URL'] = 'http://plex.env:32400';
    plexSettingsService.setSetting(db, PLEX_KEYS.url, 'http://plex.stored:32400');
    expect(getPlexUrl(db)).toBe('http://plex.stored:32400');
  });
});

describe('plex_token', () => {
  it('declares no envFallback, matching getPlexToken', () => {
    expect(fieldByKey(PLEX_KEYS.token).envFallback).toBeUndefined();
  });

  it('never reads PLEX_TOKEN from the environment', () => {
    process.env['PLEX_TOKEN'] = 'env-token';
    expect(getPlexToken(db)).toBeNull();
  });
});

describe('plex_movie_section_id / plex_tv_section_id', () => {
  it('declare envFallback matching getPlexSectionIds', () => {
    expect(fieldByKey(PLEX_KEYS.movieSectionId).envFallback).toBe('PLEX_MOVIE_SECTION_ID');
    expect(fieldByKey(PLEX_KEYS.tvSectionId).envFallback).toBe('PLEX_TV_SECTION_ID');
  });

  it('fall back to their env vars when nothing is stored', () => {
    process.env['PLEX_MOVIE_SECTION_ID'] = '1';
    process.env['PLEX_TV_SECTION_ID'] = '2';
    expect(getPlexSectionIds(db)).toEqual({ movieSectionId: '1', tvSectionId: '2' });
  });

  it('prefer stored values over env', () => {
    process.env['PLEX_MOVIE_SECTION_ID'] = '1';
    process.env['PLEX_TV_SECTION_ID'] = '2';
    plexSettingsService.setSetting(db, PLEX_KEYS.movieSectionId, '10');
    plexSettingsService.setSetting(db, PLEX_KEYS.tvSectionId, '20');
    expect(getPlexSectionIds(db)).toEqual({ movieSectionId: '10', tvSectionId: '20' });
  });
});

describe('plex_scheduler_enabled / plex_scheduler_interval_ms', () => {
  it('declare no envFallback: the scheduler env vars force-start at boot, they are not a stored-value default', () => {
    expect(fieldByKey(PLEX_KEYS.schedulerEnabled).envFallback).toBeUndefined();
    expect(fieldByKey(PLEX_KEYS.schedulerIntervalMs).envFallback).toBeUndefined();
  });
});
