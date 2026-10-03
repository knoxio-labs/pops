/**
 * Tests for the batch source sync the rotation cycle runs each tick: which
 * sources it attempts, and that one source's failure is collected rather than
 * thrown.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  openMediaDb,
  rotationCandidatesService,
  rotationSourcesService,
  type OpenedMediaDb,
} from '../../../db/index.js';
import { syncAllSources } from '../rotation-sync-all.js';

let tmpDir: string;
let opened: OpenedMediaDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-rotation-sync-all-'));
  opened = openMediaDb(join(tmpDir, 'media.db'));
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('syncAllSources', () => {
  it('leaves the manual queue alone instead of failing it for want of an adapter', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rotationCandidatesService.addToQueue(opened.db, { tmdbId: 1, title: 'By Hand', rating: 8 });
    const manual = rotationSourcesService
      .listSources(opened.db)
      .find((s) => s.type === rotationSourcesService.MANUAL_SOURCE_TYPE);
    expect(manual?.enabled).toBe(1);

    const result = await syncAllSources(opened.db);

    expect(result).toEqual({ synced: [], skipped: 0, errors: [] });
    expect(error).not.toHaveBeenCalled();
    expect(rotationSourcesService.getSource(opened.db, manual?.id ?? -1)?.lastSyncedAt).toBeNull();
  });

  it('still reports a source whose type has no adapter', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const source = rotationSourcesService.createSource(opened.db, {
      type: 'carrier_pigeon',
      name: 'Pigeon',
      priority: 5,
      enabled: true,
      config: '{}',
      syncIntervalHours: 24,
    });

    const result = await syncAllSources(opened.db);

    expect(result.synced).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.sourceId).toBe(source.id);
    expect(result.errors[0]?.error).toContain('carrier_pigeon');
  });
});
