/**
 * Unit tests for arr config resolution: stored settings over env defaults.
 *
 * Runs against a fresh on-disk `settings` / `rotation_settings` pair via the
 * real settings adapter — the same tables the federated `/settings/*` surface
 * writes — so a regression back to env-only reading fails here.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openMediaDb,
  settingsService,
  type MediaDb,
  type OpenedMediaDb,
} from '../../../../db/index.js';
import {
  getArrConfig,
  getArrSettings,
  getRadarrClient,
  getRotationDefaults,
  getSonarrClient,
} from '../config.js';

const ARR_ENV = [
  'RADARR_URL',
  'RADARR_API_KEY',
  'SONARR_URL',
  'SONARR_API_KEY',
  'RADARR_QUALITY_PROFILE_ID',
  'RADARR_ROOT_FOLDER_PATH',
] as const;

let tmpDir: string;
let opened: OpenedMediaDb;
let db: MediaDb;

function clearArrEnv(): void {
  for (const name of ARR_ENV) delete process.env[name];
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-arr-config-test-'));
  opened = openMediaDb(join(tmpDir, 'media.db'));
  db = opened.db;
  clearArrEnv();
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  clearArrEnv();
});

describe('getArrSettings', () => {
  it('falls back to env when nothing is stored', () => {
    process.env['RADARR_URL'] = 'http://radarr.env:7878';
    process.env['RADARR_API_KEY'] = 'env-radarr-key';
    process.env['SONARR_URL'] = 'http://sonarr.env:8989';
    process.env['SONARR_API_KEY'] = 'env-sonarr-key';

    expect(getArrSettings(db)).toEqual({
      radarrUrl: 'http://radarr.env:7878',
      radarrApiKey: 'env-radarr-key',
      sonarrUrl: 'http://sonarr.env:8989',
      sonarrApiKey: 'env-sonarr-key',
    });
  });

  it('prefers a stored value over the env default', () => {
    process.env['RADARR_URL'] = 'http://radarr.env:7878';
    process.env['RADARR_API_KEY'] = 'env-radarr-key';
    settingsService.setRaw(db, 'radarr_url', 'http://radarr.stored:7878');

    const settings = getArrSettings(db);
    expect(settings.radarrUrl).toBe('http://radarr.stored:7878');
    expect(settings.radarrApiKey).toBe('env-radarr-key');
  });

  it('treats a stored empty string as unset so the env default returns', () => {
    process.env['SONARR_URL'] = 'http://sonarr.env:8989';
    settingsService.setRaw(db, 'sonarr_url', '');

    expect(getArrSettings(db).sonarrUrl).toBe('http://sonarr.env:8989');
  });

  it('resolves to null when neither store nor env supplies a value', () => {
    expect(getArrSettings(db)).toEqual({
      radarrUrl: null,
      radarrApiKey: null,
      sonarrUrl: null,
      sonarrApiKey: null,
    });
  });
});

describe('client factories', () => {
  it('builds clients from stored settings with no env at all', () => {
    settingsService.setBulk(db, [
      { key: 'radarr_url', value: 'http://radarr.stored:7878' },
      { key: 'radarr_api_key', value: 'stored-radarr-key' },
      { key: 'sonarr_url', value: 'http://sonarr.stored:8989' },
      { key: 'sonarr_api_key', value: 'stored-sonarr-key' },
    ]);

    expect(getRadarrClient(db)).not.toBeNull();
    expect(getSonarrClient(db)).not.toBeNull();
    expect(getArrConfig(db)).toEqual({ radarrConfigured: true, sonarrConfigured: true });
  });

  it('returns null when only half a connection is configured', () => {
    settingsService.setRaw(db, 'radarr_url', 'http://radarr.stored:7878');

    expect(getRadarrClient(db)).toBeNull();
    expect(getArrConfig(db)).toEqual({ radarrConfigured: false, sonarrConfigured: false });
  });
});

describe('getRotationDefaults', () => {
  it('prefers stored download defaults over env', () => {
    process.env['RADARR_QUALITY_PROFILE_ID'] = '4';
    process.env['RADARR_ROOT_FOLDER_PATH'] = '/env/movies';
    settingsService.setBulk(db, [
      { key: 'rotation_quality_profile_id', value: '7' },
      { key: 'rotation_root_folder_path', value: '/stored/movies' },
    ]);

    expect(getRotationDefaults(db)).toEqual({
      qualityProfileId: 7,
      rootFolderPath: '/stored/movies',
    });
  });

  it('falls back to env when nothing is stored', () => {
    process.env['RADARR_QUALITY_PROFILE_ID'] = '4';
    process.env['RADARR_ROOT_FOLDER_PATH'] = '/env/movies';

    expect(getRotationDefaults(db)).toEqual({ qualityProfileId: 4, rootFolderPath: '/env/movies' });
  });

  it('returns null when either half is missing', () => {
    settingsService.setRaw(db, 'rotation_quality_profile_id', '7');

    expect(getRotationDefaults(db)).toBeNull();
  });

  it('returns null when the stored profile id is not a number', () => {
    settingsService.setBulk(db, [
      { key: 'rotation_quality_profile_id', value: 'not-a-number' },
      { key: 'rotation_root_folder_path', value: '/stored/movies' },
    ]);

    expect(getRotationDefaults(db)).toBeNull();
  });
});
