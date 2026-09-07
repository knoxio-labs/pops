/**
 * A pillar Dockerfile CI builds must be one production deploys.
 *
 * `docker-build.yml` discovers images from disk (`find pillars -maxdepth 2
 * -name Dockerfile`) and builds and smokes every one it finds. Nothing
 * asserted that a discovered Dockerfile is claimed by any service in
 * `infra/docker-compose.yml`, so a new `pillars/<id>/Dockerfile` could go
 * green through a full build and smoke while being absent from the production
 * topology entirely — CI reporting the pillar is fine about something
 * production has never heard of (POPS-1620).
 *
 * The gap widened once POPS-1600 made the fresh-volume smoke derive its mount
 * set from compose per Dockerfile. For a Dockerfile no service claims, that
 * derivation compares the empty set to the empty set and passes, and the smoke
 * mounts nothing and asserts nothing — which reads exactly like the correct
 * answer for the four pillars that legitimately mount nothing.
 *
 * The four image-consumed pillars pass through the `image:` arm rather than an
 * allowlist, deliberately: an allowlist rots the same way the hand-maintained
 * mount list POPS-1600 replaced did.
 *
 * Mutation-checked: making the `image:` arm claim nothing fails 3 of these;
 * letting a variant Dockerfile be claimed by its pillar's image fails 1;
 * reporting nothing as unclaimed fails 4.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as parseYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { ComposeFileSchema } from '../compose-schema.mjs';
import { normalizeDockerfilePath } from '../smoke-image.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const composeText = readFileSync(join(repoRoot, 'infra', 'docker-compose.yml'), 'utf8');

/**
 * Every `pillars/<id>/Dockerfile*` on disk, as repo-relative paths — the same
 * `maxdepth 2` set `docker-build.yml`'s discover job builds.
 */
function pillarDockerfiles(pillarsRoot = join(repoRoot, 'pillars')): string[] {
  const out: string[] = [];
  for (const pillar of readdirSync(pillarsRoot, { withFileTypes: true })) {
    if (!pillar.isDirectory()) continue;
    for (const entry of readdirSync(join(pillarsRoot, pillar.name), { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (entry.name === 'Dockerfile' || entry.name.startsWith('Dockerfile.')) {
        out.push(`pillars/${pillar.name}/${entry.name}`);
      }
    }
  }
  return out.toSorted();
}

interface ComposeClaims {
  /** Dockerfile paths some service builds, normalised. */
  readonly built: ReadonlySet<string>;
  /** Pillar ids some service consumes as a published `pops-<id>` image. */
  readonly imaged: ReadonlySet<string>;
}

function composeClaims(yaml: string): ComposeClaims {
  const compose = ComposeFileSchema.parse(parseYaml(yaml));
  const built = new Set<string>();
  const imaged = new Set<string>();

  for (const service of Object.values(compose.services)) {
    const build = service?.build;
    if (build !== undefined && typeof build !== 'string' && build.dockerfile !== undefined) {
      built.add(normalizeDockerfilePath(build.dockerfile));
    }
    const image = service?.image;
    if (image === undefined) continue;
    // `ghcr.io/${POPS_IMAGE_OWNER:-knoxio-labs}/pops-media:${POPS_IMAGE_TAG:-main}`
    // — the owner and tag are interpolated and the defaults carry their own
    // colons, so splitting on `:` finds the wrong one. Match the repository
    // segment directly instead.
    const repository = /(?:^|\/)pops-([a-z0-9][a-z0-9.-]*?)(?::|$)/u.exec(image)?.[1];
    if (repository !== undefined) imaged.add(repository);
  }
  return { built, imaged };
}

/**
 * The Dockerfiles no compose service claims.
 *
 * A variant (`Dockerfile.api`) must be claimed by an explicit
 * `build.dockerfile`: the `image:` arm resolves a pillar id, and a pillar
 * already consumed as an image would otherwise absorb any number of new
 * variants without a word.
 */
function unclaimedDockerfiles(dockerfiles: readonly string[], yaml: string): string[] {
  const { built, imaged } = composeClaims(yaml);
  return dockerfiles
    .filter((path) => {
      if (built.has(normalizeDockerfilePath(path))) return false;
      const [, pillar, file] = path.split('/');
      return !(file === 'Dockerfile' && pillar !== undefined && imaged.has(pillar));
    })
    .toSorted();
}

/** `build.dockerfile` entries naming a file that is not on disk. */
function danglingBuilds(dockerfiles: readonly string[], yaml: string): string[] {
  const onDisk = new Set(dockerfiles.map((path) => normalizeDockerfilePath(path)));
  return [...composeClaims(yaml).built].filter((path) => !onDisk.has(path)).toSorted();
}

const FIXTURE = `
services:
  media:
    build:
      context: ..
      dockerfile: pillars/media/Dockerfile
    image: ghcr.io/\${POPS_IMAGE_OWNER:-knoxio-labs}/pops-media:\${POPS_IMAGE_TAG:-main}
  shell:
    image: ghcr.io/\${POPS_IMAGE_OWNER:-knoxio-labs}/pops-shell:\${POPS_IMAGE_TAG:-main}
  paperless:
    image: ghcr.io/paperless-ngx/paperless-ngx:2.14
  anchored:
`;

describe('the claim reader', () => {
  it('reads a Dockerfile a service builds', () => {
    expect(unclaimedDockerfiles(['pillars/media/Dockerfile'], FIXTURE)).toEqual([]);
  });

  it('reads a pillar a service only consumes as a published image', () => {
    expect(unclaimedDockerfiles(['pillars/shell/Dockerfile'], FIXTURE)).toEqual([]);
  });

  it('reports a Dockerfile no service claims at all', () => {
    expect(unclaimedDockerfiles(['pillars/ghost/Dockerfile'], FIXTURE)).toEqual([
      'pillars/ghost/Dockerfile',
    ]);
  });

  it('reports a Dockerfile whose compose service was deleted', () => {
    const withoutMedia = ['services:', '  paperless:', '    image: ghcr.io/x/y:1'].join('\n');
    expect(unclaimedDockerfiles(['pillars/media/Dockerfile'], withoutMedia)).toEqual([
      'pillars/media/Dockerfile',
    ]);
  });

  it('does not let a pillar consumed as an image absorb a new variant Dockerfile', () => {
    expect(unclaimedDockerfiles(['pillars/shell/Dockerfile.worker'], FIXTURE)).toEqual([
      'pillars/shell/Dockerfile.worker',
    ]);
  });

  it('does not read a third-party image as a pillar claim', () => {
    expect(unclaimedDockerfiles(['pillars/paperless-ngx/Dockerfile'], FIXTURE)).toEqual([
      'pillars/paperless-ngx/Dockerfile',
    ]);
  });

  it('tolerates a valueless service entry rather than throwing on it', () => {
    expect(() => unclaimedDockerfiles([], FIXTURE)).not.toThrow();
  });

  it('reports a build entry pointing at a Dockerfile that is not on disk', () => {
    expect(danglingBuilds(['pillars/shell/Dockerfile'], FIXTURE)).toEqual([
      'pillars/media/Dockerfile',
    ]);
  });
});

describe('this repo', () => {
  const dockerfiles = pillarDockerfiles();

  it('has pillar Dockerfiles to check, so the assertions below are not vacuous', () => {
    expect(dockerfiles.length).toBeGreaterThan(0);
  });

  it('claims some Dockerfiles by build and some pillars by image', () => {
    const { built, imaged } = composeClaims(composeText);
    expect(
      built.size,
      'no compose service names a dockerfile — the parse is wrong'
    ).toBeGreaterThan(0);
    expect(
      imaged.size,
      'no compose service names a pops-* image — the parse is wrong'
    ).toBeGreaterThan(0);
  });

  it('deploys every pillar Dockerfile it builds', () => {
    const unclaimed = unclaimedDockerfiles(dockerfiles, composeText);
    expect(
      unclaimed,
      `${unclaimed.join(', ')} would be built and smoked by docker-build.yml, but no service in ` +
        'infra/docker-compose.yml builds them or consumes their published image. Add the service, ' +
        'or delete the Dockerfile — a green build of an image nothing deploys says nothing.'
    ).toEqual([]);
  });

  it('builds every Dockerfile its compose services name', () => {
    const dangling = danglingBuilds(dockerfiles, composeText);
    expect(
      dangling,
      `infra/docker-compose.yml builds ${dangling.join(', ')}, which is not on disk.`
    ).toEqual([]);
  });
});
