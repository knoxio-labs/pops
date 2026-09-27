import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const CURRENT_RELEASE_FILE = '.ui-dev-current.json';
const RELEASES_DIRECTORY = '.ui-dev-releases';
const RELEASE_URL_PREFIX = '__pops-release';

/** A parsed same-origin URL for a loader-mounted pillar UI asset. */
export interface UiRequest {
  readonly pillarId: string;
  readonly file: string;
}

function isSafeUiFile(file: string): boolean {
  const normalized = path.posix.normalize(file);
  return !(
    file.includes('\0') ||
    file.includes('\\') ||
    file.startsWith('/') ||
    normalized !== file ||
    normalized === '..' ||
    normalized.startsWith('../')
  );
}

/** Parse and contain a `/<pillar>-ui/<file>` request. */
export function parseUiRequest(url: string): UiRequest | undefined {
  const [pathname] = url.split('?');
  if (pathname === undefined) return undefined;
  const match = /^\/([a-z][a-z0-9-]*)-ui\/(.+)$/.exec(pathname);
  const pillarId = match?.[1];
  const encoded = match?.[2];
  if (pillarId === undefined || encoded === undefined) return undefined;
  let file: string;
  try {
    file = decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
  if (!isSafeUiFile(file)) return undefined;
  return { pillarId, file };
}

/** Parse the comma-separated pillar ids accepted by `POPS_PILLAR_UI_SOURCE`. */
export function sourcePillarsFrom(value: string | undefined): ReadonlySet<string> {
  if (value === undefined || value.trim() === '') return new Set();
  return new Set(
    value
      .split(',')
      .map((pillarId) => pillarId.trim())
      .filter((pillarId) => /^[a-z][a-z0-9-]*$/.test(pillarId))
  );
}

/** Make Vite's virtual module identifier for a source-mode pillar. */
export function sourceModuleId(pillarId: string): string {
  return `\0pops-pillar-ui-source:${pillarId}`;
}

/** Resolve a source-mode pillar's remote JavaScript entry. */
export function sourceEntry(repoRoot: string, pillarId: string): string {
  return path.join(repoRoot, 'pillars', pillarId, 'app', 'src', 'remote-entry.ts');
}

/** Build the virtual source-mode module with its stylesheet in Vite's HMR graph. */
export function sourceModuleSource(repoRoot: string, pillarId: string): string {
  const appRoot = path.join(repoRoot, 'pillars', pillarId, 'app');
  return [
    `import ${JSON.stringify(path.join(appRoot, 'remote.css'))};`,
    `export * from ${JSON.stringify(sourceEntry(repoRoot, pillarId))};`,
  ].join('\n');
}

/** Read the release selected by an app's completed-build pointer. */
export function releaseFor(appRoot: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(path.join(appRoot, 'dist', CURRENT_RELEASE_FILE), 'utf8')
    );
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'release' in parsed &&
      typeof parsed.release === 'string' &&
      /^[a-z0-9-]+$/.test(parsed.release)
    ) {
      return parsed.release;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Parse a URL that is already pinned to one immutable local release. */
export function releasePathFor(request: UiRequest): { release: string; file: string } | undefined {
  const [prefix, release, ...segments] = request.file.split('/');
  if (
    prefix !== RELEASE_URL_PREFIX ||
    release === undefined ||
    !/^[a-z0-9-]+$/.test(release) ||
    segments.length === 0
  ) {
    return undefined;
  }
  const file = segments.join('/');
  return path.posix.normalize(file).startsWith('..') ? undefined : { release, file };
}

/** Make the same-origin URL that pins an asset to a completed local release. */
export function releaseUrl(request: UiRequest, release: string): string {
  return `/${request.pillarId}-ui/${RELEASE_URL_PREFIX}/${release}/${request.file}`;
}

/** Find the local file requested by a stable or release-qualified bundle URL. */
export function publishedBundleFile(repoRoot: string, request: UiRequest): string | undefined {
  const appRoot = path.join(repoRoot, 'pillars', request.pillarId, 'app');
  const qualified = releasePathFor(request);
  const release = qualified?.release ?? releaseFor(appRoot);
  const requestedFile = qualified?.file ?? request.file;
  if (release === undefined) {
    if (qualified !== undefined) return undefined;
    const file = path.join(appRoot, 'dist', 'remote', requestedFile);
    return existsSync(file) && statSync(file).isFile() ? file : undefined;
  }
  const file = path.join(appRoot, 'dist', RELEASES_DIRECTORY, release, requestedFile);
  return existsSync(file) && statSync(file).isFile() ? file : undefined;
}

/** Whether a filesystem event updates a completed remote-build pointer. */
export function isPublishedReleasePointer(repoRoot: string, changedPath: string): boolean {
  const relative = path.relative(repoRoot, changedPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  const segments = relative.split(path.sep);
  return (
    segments.length === 5 &&
    segments[0] === 'pillars' &&
    segments[2] === 'app' &&
    segments[3] === 'dist' &&
    segments[4] === CURRENT_RELEASE_FILE
  );
}

/** Reload only when a new or replacement completed-build pointer appears. */
export function reloadForPublishedRelease(
  repoRoot: string,
  changedPath: string,
  reload: () => void
): void {
  if (isPublishedReleasePointer(repoRoot, changedPath)) reload();
}

/** The subset of a Vite watcher used to observe local release publication. */
export interface PublishedReleaseWatcher {
  on(event: 'add' | 'change', listener: (changedPath: string) => void): unknown;
}

/** Attach pointer publication and replacement events to one shell reload action. */
export function attachPublishedReleaseReload(
  watcher: PublishedReleaseWatcher,
  repoRoot: string,
  reload: () => void
): void {
  const listener = (changedPath: string): void =>
    reloadForPublishedRelease(repoRoot, changedPath, reload);
  watcher.on('add', listener);
  watcher.on('change', listener);
}
