import { afterEach, describe, expect, it } from 'vitest';

import { createInventoryFake } from './inventory-fake.js';
import { closeOpenedApps, openWith } from './mobile-inventory-app.js';
import { requestOn } from './test-http.js';

afterEach(closeOpenedApps);

function openCatalogue() {
  const fake = createInventoryFake({
    catalogueResult: {
      kind: 'ok',
      value: { version: 'cat-7', units: [], types: [] },
    },
  });
  return openWith(fake.factory);
}

describe('mobile answers are not cacheable', () => {
  it('marks a mobile answer no-store', async () => {
    const { app, token } = openCatalogue();

    const res = await requestOn(app, (r) =>
      r.get('/mobile/inventory/types').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers a repeat request carrying the earlier ETag in full, never 304', async () => {
    const { app, token } = openCatalogue();
    const first = await requestOn(app, (r) =>
      r.get('/mobile/inventory/types').set('Authorization', `Bearer ${token}`)
    );
    const etag = String(first.headers.etag ?? 'W/"any"');

    const repeat = await requestOn(app, (r) =>
      r
        .get('/mobile/inventory/types')
        .set('Authorization', `Bearer ${token}`)
        .set('If-None-Match', etag)
        .set('If-Modified-Since', new Date().toUTCString())
    );

    expect(repeat.status).toBe(200);
    expect(repeat.body.version).toBe('cat-7');
  });
});
