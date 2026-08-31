/**
 * Unit tests for the disk selection behind the rotation cycle's free-space
 * measurement. Radarr reports one entry per mounted filesystem, so picking the
 * wrong one measures a volume the engine's own deletions cannot change.
 */
import { describe, expect, it } from 'vitest';

import {
  getRadarrMovieFacts,
  type MovieFactsClient,
  selectDiskForRootFolder,
} from '../rotation-removal.js';

import type { RadarrDiskSpace, RadarrMovie } from '../../clients/arr/index.js';

function disk(path: string, freeGb: number): RadarrDiskSpace {
  return { path, label: path, freeSpace: freeGb, totalSpace: freeGb * 2 };
}

describe('selectDiskForRootFolder', () => {
  it('prefers the deepest mount containing the root folder over the root filesystem', () => {
    const disks = [
      disk('/', 238),
      disk('/config', 238),
      disk('/downloads', 1899),
      disk('/movies', 314),
    ];
    expect(selectDiskForRootFolder(disks, '/movies')?.freeSpace).toBe(314);
  });

  it('matches a root folder nested below the mount point', () => {
    const disks = [disk('/', 10), disk('/media', 500)];
    expect(selectDiskForRootFolder(disks, '/media/movies/4k')?.path).toBe('/media');
  });

  it('falls back to the root filesystem only when nothing deeper contains the path', () => {
    const disks = [disk('/', 10), disk('/downloads', 900)];
    expect(selectDiskForRootFolder(disks, '/srv/movies')?.path).toBe('/');
  });

  it('does not treat a sibling with a shared prefix as the containing mount', () => {
    const disks = [disk('/movies-archive', 900)];
    expect(selectDiskForRootFolder(disks, '/movies')).toBeNull();
  });

  it('ignores trailing slashes on either side', () => {
    const disks = [disk('/', 10), disk('/movies/', 314)];
    expect(selectDiskForRootFolder(disks, '/movies/')?.freeSpace).toBe(314);
  });

  it('returns null when no mount contains the root folder', () => {
    expect(selectDiskForRootFolder([disk('/downloads', 900)], '/movies')).toBeNull();
  });

  it('returns null for an empty disk list', () => {
    expect(selectDiskForRootFolder([], '/movies')).toBeNull();
  });
});

const GB = 1_073_741_824;

function radarrMovie(over: Partial<RadarrMovie> = {}): RadarrMovie {
  return {
    id: 1,
    tmdbId: 100,
    title: 'A Movie',
    monitored: true,
    hasFile: true,
    sizeOnDisk: 10 * GB,
    ...over,
  };
}

function clientReturning(movies: RadarrMovie[]): MovieFactsClient {
  return { getMovies: () => Promise.resolve(movies) };
}

describe('getRadarrMovieFacts', () => {
  /**
   * `added` is when the record entered Radarr, not when the library grew. On
   * the live library the two disagree by a median of 138 days, so ranking on
   * `added` invents an age for a file that did not exist yet.
   */
  it('dates a movie from its file, not from when the record was added', async () => {
    const facts = await getRadarrMovieFacts(
      clientReturning([
        radarrMovie({
          added: '2024-01-01T00:00:00.000Z',
          movieFile: { dateAdded: '2025-11-01T00:00:00.000Z' },
        }),
      ])
    );

    expect(facts.acquiredAt.get(100)).toBe('2025-11-01T00:00:00.000Z');
  });

  it('falls back to the record date when the file carries none', async () => {
    const facts = await getRadarrMovieFacts(
      clientReturning([radarrMovie({ added: '2024-01-01T00:00:00.000Z', movieFile: {} })])
    );

    expect(facts.acquiredAt.get(100)).toBe('2024-01-01T00:00:00.000Z');
  });

  it('leaves a movie with no date at all out of the map rather than guessing', async () => {
    const facts = await getRadarrMovieFacts(clientReturning([radarrMovie()]));

    expect(facts.acquiredAt.has(100)).toBe(false);
    expect(facts.sizes.get(100)).toBeCloseTo(10, 6);
  });

  it('ignores a movie with no file on disk', async () => {
    const facts = await getRadarrMovieFacts(
      clientReturning([radarrMovie({ sizeOnDisk: 0, hasFile: false })])
    );

    expect(facts.sizes.size).toBe(0);
    expect(facts.acquiredAt.size).toBe(0);
  });
});
