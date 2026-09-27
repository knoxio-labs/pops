import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  cleanPreviousSessionReleases,
  clearPublishedReleasePointer,
  createRebuildQueue,
  isRemoteBuildInput,
  localLibraryDependencyClosure,
  pillarIdsFromArgs,
  publishRemoteBundle,
  readPublishedRelease,
} from './ui-remote-watch.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function temporaryApp(): Promise<string> {
  await mkdir(path.join(process.cwd(), 'tmp'), { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(process.cwd(), 'tmp', 'ui-remote-watch-'));
  temporaryDirectories.push(temporaryRoot);
  const appRoot = path.join(temporaryRoot, 'app');
  await mkdir(path.join(appRoot, 'dist', 'remote'), { recursive: true });
  return appRoot;
}

describe('pillarIdsFromArgs', () => {
  it('deduplicates repeated pillar ids and rejects a missing value', () => {
    expect(pillarIdsFromArgs(['--pillar', 'media', '--pillar', 'media', '--pillar', 'ai'])).toEqual(
      ['media', 'ai']
    );
    expect(() => pillarIdsFromArgs(['--pillar'])).toThrow('`--pillar` needs a pillar id');
  });
});

describe('isRemoteBuildInput', () => {
  it('rebuilds app inputs and its direct shared-library dependencies only', () => {
    const appRoot = '/repo/pillars/media/app';
    const sharedRoots = ['/repo/libs/ui', '/repo/libs/navigation'];
    expect(isRemoteBuildInput(appRoot, `${appRoot}/src/pages/library.tsx`)).toBe(true);
    expect(isRemoteBuildInput(appRoot, `${appRoot}/scripts/build-remote.ts`)).toBe(true);
    expect(isRemoteBuildInput(appRoot, `${appRoot}/remote.css`)).toBe(true);
    expect(isRemoteBuildInput(appRoot, `${appRoot}/dist/remote/media.js`)).toBe(false);
    expect(
      isRemoteBuildInput(appRoot, '/repo/libs/ui/src/components/button.tsx', sharedRoots)
    ).toBe(true);
    expect(isRemoteBuildInput(appRoot, '/repo/libs/date/src/format.ts', sharedRoots)).toBe(false);
    expect(isRemoteBuildInput(appRoot, '/repo/pillars/ai/app/src/index.ts')).toBe(false);
  });
});

describe('localLibraryDependencyClosure', () => {
  it('watches transitive local libraries that a direct dependency imports', () => {
    const roots = localLibraryDependencyClosure(
      new Map([
        [
          '@pops/navigation',
          { root: '/repo/libs/navigation', dependencies: ['@pops/module-registry'] },
        ],
        [
          '@pops/module-registry',
          { root: '/repo/libs/module-registry', dependencies: ['@pops/types'] },
        ],
        ['@pops/types', { root: '/repo/libs/types', dependencies: [] }],
      ]),
      ['@pops/navigation']
    );
    expect(roots).toEqual([
      '/repo/libs/module-registry',
      '/repo/libs/navigation',
      '/repo/libs/types',
    ]);
  });
});

describe('createRebuildQueue', () => {
  it('coalesces changes during a build into one follow-up run after a failure', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    let rejectFirstBuild: ((reason: Error) => void) | undefined;
    const queue = createRebuildQueue(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          await new Promise<void>((_resolve, reject) => {
            rejectFirstBuild = reject;
          });
        }
      },
      { debounceMs: 20 }
    );

    queue.request();
    await vi.advanceTimersByTimeAsync(20);
    queue.request();
    rejectFirstBuild?.(new Error('first build fails'));
    await vi.advanceTimersByTimeAsync(20);
    await queue.close();

    expect(attempts).toBe(2);
    vi.useRealTimers();
  });

  it('cancels a waiting rebuild when the watcher closes', async () => {
    vi.useFakeTimers();
    const rebuild = vi.fn(async () => undefined);
    const queue = createRebuildQueue(rebuild, { debounceMs: 20 });

    queue.request();
    await queue.close();
    await vi.advanceTimersByTimeAsync(20);

    expect(rebuild).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('publishRemoteBundle', () => {
  it('keeps prior lazy chunks readable after a newer release is published', async () => {
    const appRoot = await temporaryApp();
    const remoteFile = path.join(appRoot, 'dist', 'remote', 'media.js');
    const chunkFile = path.join(appRoot, 'dist', 'remote', 'page-one.js');
    await writeFile(remoteFile, 'first');
    await writeFile(chunkFile, 'old chunk');
    await publishRemoteBundle({ appRoot, releaseId: 'one' });

    await writeFile(remoteFile, 'second');
    await writeFile(chunkFile, 'new chunk');
    await publishRemoteBundle({ appRoot, releaseId: 'two' });

    expect(await readPublishedRelease(appRoot)).toBe('two');
    expect(
      await readFile(path.join(appRoot, 'dist', '.ui-dev-releases', 'two', 'media.js'), 'utf8')
    ).toBe('second');
    expect(
      await readFile(path.join(appRoot, 'dist', '.ui-dev-releases', 'one', 'page-one.js'), 'utf8')
    ).toBe('old chunk');
  });

  it('removes earlier-session releases only when a watcher starts', async () => {
    const appRoot = await temporaryApp();
    const remoteFile = path.join(appRoot, 'dist', 'remote', 'media.js');
    await writeFile(remoteFile, 'current');
    await publishRemoteBundle({ appRoot, releaseId: 'current' });
    await writeFile(remoteFile, 'obsolete');
    await publishRemoteBundle({ appRoot, releaseId: 'obsolete' });
    await writeFile(path.join(appRoot, 'dist', '.ui-dev-current.json'), '{"release":"current"}\n');

    await cleanPreviousSessionReleases(appRoot);

    await expect(
      readFile(path.join(appRoot, 'dist', '.ui-dev-releases', 'obsolete', 'media.js'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(
      await readFile(path.join(appRoot, 'dist', '.ui-dev-releases', 'current', 'media.js'), 'utf8')
    ).toBe('current');
  });

  it('clears the pointer when a watcher session ends so ordinary builds use dist again', async () => {
    const appRoot = await temporaryApp();
    await writeFile(path.join(appRoot, 'dist', 'remote', 'media.js'), 'release');
    await publishRemoteBundle({ appRoot, releaseId: 'session' });

    await clearPublishedReleasePointer(appRoot);

    expect(await readPublishedRelease(appRoot)).toBeUndefined();
  });
});
