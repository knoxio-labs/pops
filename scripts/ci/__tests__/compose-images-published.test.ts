import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Every `ghcr.io/<owner>/pops-*` image the production compose pins must be
 * published by `publish-images.yml`, and every Dockerfile it is published from
 * must exist.
 *
 * The gap this closes is silent in both directions and was reached on the
 * first try. `publish-images.yml` discovers most pillar images by reading
 * `pops-<pillar>` out of compose and resolving `pillars/<pillar>/Dockerfile`;
 * a service pinning an image that fits neither that pattern nor the
 * hand-written `apps` list — `pops-purchases-ui`, built from
 * `pillars/purchases/app` (POPS-3217) — is simply never built. Nothing fails:
 * the workflow succeeds having published everything it knew about, and the
 * deployment pulls a tag that does not exist. Eight more `-ui` images are
 * scheduled behind that one.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

/**
 * Image names pinned by the production compose. Owner-agnostic and
 * hyphen-tolerant: compose writes the owner as `${POPS_IMAGE_OWNER:-…}`, and
 * an image name may carry more than one hyphen (`pops-design-api`,
 * `pops-purchases-ui`) — the narrower `pops-[a-z]+` those are easy to write
 * silently skips exactly the multi-word names.
 */
function composeImages(): Set<string> {
  const matches = read('infra/docker-compose.yml').matchAll(
    /image:\s*ghcr\.io\/[^/\s]+\/(pops-[a-z0-9-]+):/g
  );
  return new Set([...matches].map((match) => match[1]).filter((name) => name !== undefined));
}

/** `{ image: pops-x, file: … }` entries in the hand-written `apps` matrix. */
function publishedByAppsMatrix(): Map<string, string> {
  const matches = read('.github/workflows/publish-images.yml').matchAll(
    /-\s*\{\s*image:\s*(pops-[a-z0-9-]+),\s*file:\s*([^\s}]+)\s*\}/g
  );
  const out = new Map<string, string>();
  for (const match of matches) {
    const [, image, file] = match;
    if (image !== undefined && file !== undefined) out.set(image, file);
  }
  return out;
}

/**
 * Images the workflow discovers rather than lists: a compose-pinned
 * `pops-<pillar>` backed by `pillars/<pillar>/Dockerfile`. Mirrors the shell
 * in the `discover` job; if that rule changes, this reads as a failure here
 * rather than as a missing image in production.
 */
function publishedByPillarDiscovery(images: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const image of images) {
    const pillar = /^pops-([a-z]+)$/.exec(image)?.[1];
    if (pillar === undefined) continue;
    try {
      read(`pillars/${pillar}/Dockerfile`);
      out.add(image);
    } catch {
      // No Dockerfile at that path — the discovery skips it too.
    }
  }
  return out;
}

describe('every compose-pinned image is published', () => {
  const images = composeImages();

  it('finds the images to check', () => {
    expect(images.size).toBeGreaterThan(5);
  });

  it.each([...images].toSorted())('%s is built by publish-images.yml', (image) => {
    const listed = publishedByAppsMatrix().has(image);
    const discovered = publishedByPillarDiscovery(images).has(image);
    expect(
      listed || discovered,
      `${image} is in neither the apps matrix nor pillar discovery`
    ).toBe(true);
  });

  // A hyphen in the middle is what the discovery regex cannot see, so it is
  // the case worth naming: these are exactly the images that must be listed.
  it('lists every multi-word image in the apps matrix', () => {
    const listed = publishedByAppsMatrix();
    for (const image of images) {
      if (/^pops-[a-z]+$/.test(image)) continue;
      expect(listed.has(image), `${image} must be listed explicitly`).toBe(true);
    }
  });
});

describe('every published image has a Dockerfile', () => {
  it.each([...publishedByAppsMatrix()].toSorted(([a], [b]) => a.localeCompare(b)))(
    '%s builds from a file that exists',
    (_image, file) => {
      expect(() => read(file)).not.toThrow();
    }
  );
});

describe("CI's Dockerfile discovery reaches a pillar app image", () => {
  // The build-and-smoke matrix used `-maxdepth 2`, which stops one directory
  // short of `pillars/<x>/app/Dockerfile`. An image nothing builds in CI is
  // one whose first build is the publish, on main.
  it('searches pillars/*/app as well as pillars/*', () => {
    const workflow = read('.github/workflows/docker-build.yml');
    expect(workflow).toContain(
      "find pillars -mindepth 3 -maxdepth 3 -path 'pillars/*/app/Dockerfile*'"
    );
  });

  it('still searches the top two levels', () => {
    const workflow = read('.github/workflows/docker-build.yml');
    expect(workflow).toContain('find pillars -maxdepth 2');
  });
});
