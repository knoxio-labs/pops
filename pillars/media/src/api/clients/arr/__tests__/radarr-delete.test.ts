/**
 * What `deleteMovie` asks Radarr to do.
 *
 * Radarr's `DELETE /movie/{id}` takes `addImportExclusion` alongside
 * `deleteFiles`, and setting it puts the movie on Radarr's import exclusion
 * list — a real blacklist that would stop the title ever being re-acquired.
 * Rotation is a revolving door: it removes files, it does not ban titles
 * (POPS-2720). Nothing else in the codebase would catch that parameter
 * appearing, so it is asserted on the wire.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RadarrClient } from '../radarr-client.js';

const fetchMock = vi.fn((): Promise<Response> =>
  Promise.resolve(new Response(null, { status: 200 }))
);

function requestedUrl(): string {
  const call = fetchMock.mock.calls[0] as unknown as [string | URL] | undefined;
  return String(call?.[0] ?? '');
}

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe('RadarrClient.deleteMovie', () => {
  it('deletes the file without adding an import exclusion', async () => {
    vi.stubGlobal('fetch', fetchMock);

    await new RadarrClient('http://radarr.test:7878', 'key').deleteMovie(42, true);

    const url = requestedUrl();
    expect(url).toContain('/movie/42');
    expect(url).toContain('deleteFiles=true');
    expect(url).not.toContain('addImportExclusion');
    expect(url.toLowerCase()).not.toContain('exclusion');
  });

  it('still adds no exclusion when asked to keep the file', async () => {
    vi.stubGlobal('fetch', fetchMock);

    await new RadarrClient('http://radarr.test:7878', 'key').deleteMovie(7, false);

    expect(requestedUrl()).toContain('deleteFiles=false');
    expect(requestedUrl()).not.toContain('addImportExclusion');
  });
});
