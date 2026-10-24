import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ManifestPayloadSchema } from '@pops/pillar-sdk/manifest-schema';

import { manifest } from './manifest';
import { bundles, routes } from './routes';

const advertised = ManifestPayloadSchema.parse(
  JSON.parse(
    readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/manifest.json'),
      'utf8'
    )
  )
);

describe('contacts remote app contract', () => {
  it('implements every server-advertised bundle slot without an extra unadvertised surface', () => {
    expect([...new Set(advertised.pages?.map((page) => page.bundleSlot))].toSorted()).toEqual(
      Object.keys(bundles).toSorted()
    );
    expect(manifest.id).toBe(advertised.pillar);
  });
  it('mounts the upload entry and stable staged-batch review route declared by the server', () => {
    expect(routes.map((route) => route.path ?? '')).toEqual(
      advertised.pages?.map((page) => page.path)
    );
    expect(routes[0]?.index).toBe(true);
    expect(advertised.nav?.basePath).toBe('/contacts');
    expect(advertised.assetsBaseUrl).toBe('/contacts-api/ui/contacts.js');
    expect(advertised.stylesheetUrl).toBe('/contacts-api/ui/contacts.css');
  });
});
