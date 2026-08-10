import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as parseYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import {
  ComposeFileSchema,
  ComposeServiceSchema,
  ComposeVolumeEntrySchema,
} from '../compose-schema.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const productionComposeText = readFileSync(join(repoRoot, 'infra', 'docker-compose.yml'), 'utf8');

describe('ComposeVolumeEntrySchema', () => {
  it('accepts the short string form', () => {
    expect(ComposeVolumeEntrySchema.parse('sqlite-data:/data/sqlite:ro')).toBe(
      'sqlite-data:/data/sqlite:ro'
    );
  });

  it('accepts the long object form', () => {
    expect(
      ComposeVolumeEntrySchema.parse({ type: 'bind', target: '/data/sqlite', read_only: true })
    ).toEqual({ type: 'bind', target: '/data/sqlite', read_only: true });
  });

  it('accepts the long form with only the required target', () => {
    expect(ComposeVolumeEntrySchema.parse({ target: '/data/sqlite' })).toEqual({
      target: '/data/sqlite',
    });
  });

  it('rejects an object entry with no target', () => {
    expect(() => ComposeVolumeEntrySchema.parse({ type: 'volume' })).toThrow();
  });
});

describe('ComposeServiceSchema', () => {
  it('is a superset: build, volumes and environment all validate together', () => {
    const service = {
      build: { dockerfile: 'pillars/fixture/Dockerfile' },
      volumes: ['sqlite-data:/data/sqlite'],
      environment: { CLOUDFLARE_ACCESS_AUD: '${CLOUDFLARE_ACCESS_AUD:-}' },
    };
    expect(ComposeServiceSchema.parse(service)).toEqual(service);
  });

  it('treats every field as optional, for a service declared by image alone', () => {
    expect(ComposeServiceSchema.parse({})).toEqual({});
  });

  it('accepts null, for a value-less service key', () => {
    expect(ComposeServiceSchema.parse(null)).toBeNull();
  });

  it('strips fields no scripts/ci guard reads, rather than rejecting them', () => {
    expect(
      ComposeServiceSchema.parse({
        image: 'ghcr.io/knoxio-labs/pops-fixture:main',
        ports: ['3000:3000'],
        depends_on: ['redis'],
        healthcheck: { test: ['CMD', 'true'] },
      })
    ).toEqual({});
  });

  it('accepts the string form of build, which names the context alone', () => {
    expect(ComposeServiceSchema.parse({ build: '..' })).toEqual({ build: '..' });
  });

  it('rejects a build declared as neither a string nor a dockerfile object', () => {
    expect(() => ComposeServiceSchema.parse({ build: 42 })).toThrow();
  });

  it('rejects an environment value that is not a map', () => {
    expect(() => ComposeServiceSchema.parse({ environment: ['FOO=bar'] })).toThrow();
  });
});

describe('ComposeFileSchema', () => {
  it('rejects a document with no services map at all', () => {
    expect(() => ComposeFileSchema.parse({ services: 'not-a-map' })).toThrow();
  });

  it('accepts a document that declares no services', () => {
    expect(ComposeFileSchema.parse({})).toEqual({});
  });

  it('parses the real infra/docker-compose.yml without throwing', () => {
    expect(() => ComposeFileSchema.parse(parseYaml(productionComposeText))).not.toThrow();
  });

  it('captures build, volumes and environment together on the same real service', () => {
    // registry-api is the one service in production compose that exercises
    // every field the superset schema models — the proof that combining them
    // is not merely type-level.
    const compose = ComposeFileSchema.parse(parseYaml(productionComposeText));
    const registryApi = compose.services?.['registry-api'];
    expect(registryApi?.build).toBeDefined();
    expect(registryApi?.volumes).toContain('sqlite-data:/data/sqlite');
    expect(registryApi?.environment?.CLOUDFLARE_ACCESS_TEAM_NAME).toBe(
      '${CLOUDFLARE_ACCESS_TEAM_NAME:-}'
    );
  });

  it('reads a published-image-only service, which declares no build', () => {
    const compose = ComposeFileSchema.parse(parseYaml(productionComposeText));
    const shell = compose.services?.['pops-shell'];
    expect(shell).toBeDefined();
    expect(shell?.build).toBeUndefined();
    expect(shell?.environment?.POPS_REGISTRY_URL).toBeDefined();
  });
});
