/**
 * Unit tests for the disk selection behind the rotation cycle's free-space
 * measurement. Radarr reports one entry per mounted filesystem, so picking the
 * wrong one measures a volume the engine's own deletions cannot change.
 */
import { describe, expect, it } from 'vitest';

import { selectDiskForRootFolder } from '../rotation-removal.js';

import type { RadarrDiskSpace } from '../../clients/arr/index.js';

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
