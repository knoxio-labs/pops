import { json } from './pillar-rest';

import type { Page } from '@playwright/test';

/** Typed owner seam for source-host browser checks; association and original identities differ. */
export async function stubEventDocuments(page: Page): Promise<{ writes: unknown[] }> {
  const writes: unknown[] = [];
  const association = {
    id: 81,
    tripId: 7,
    documentId: 91,
    targetKind: 'event',
    targetId: 19,
    createdAt: '2029-01-01T00:00:00Z',
  };
  let linked = true;
  await page.route(/\/trips-api\/trips\/7\/document-associations(?:\/81)?$/, async (route) => {
    if (route.request().method() === 'DELETE') {
      writes.push({ method: 'DELETE', path: new URL(route.request().url()).pathname });
      linked = false;
      await route.fulfill({ status: 204 });
    } else if (route.request().method() === 'POST') {
      const body: unknown = route.request().postDataJSON();
      writes.push(body);
      linked = true;
      await json(route, 201, association);
    } else {
      await json(route, 200, { associations: linked ? [association] : [] });
    }
  });
  await page.route(/\/documents-api\/paperless\/status$/, (route) =>
    json(route, 200, {
      data: {
        configured: true,
        available: true,
        maxUploadBytes: 1000,
        allowedMimeTypes: ['application/pdf'],
      },
    })
  );
  const original = {
    id: 91,
    title: 'Owner ticket',
    created: '2029-01-01',
    originalFileName: 'ticket.pdf',
    thumbnailUrl: '',
  };
  await page.route(/\/documents-api\/paperless\/documents\/91$/, (route) =>
    json(route, 200, { data: original })
  );
  await page.route(/\/documents-api\/paperless\/search\?/, (route) =>
    json(route, 200, { data: [original] })
  );
  return { writes };
}

/** Explicit unavailable Documents owner with empty Trips links for source-only browser scenarios. */
export async function stubUnavailableSourceDocuments(page: Page, tripId: number): Promise<void> {
  await page.route(`**/trips-api/trips/${tripId}/document-associations`, (route) =>
    json(route, 200, { associations: [] })
  );
  await page.route(/\/documents-api\/paperless\/status$/, (route) =>
    json(route, 200, {
      data: {
        configured: false,
        available: false,
        maxUploadBytes: 1000,
        allowedMimeTypes: ['application/pdf'],
      },
    })
  );
}
