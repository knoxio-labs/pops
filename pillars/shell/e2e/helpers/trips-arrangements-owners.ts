import { expect } from '@playwright/test';

import { json } from './pillar-rest';

import type { Page } from '@playwright/test';

/** Fictional canonical reference actually returned by the owner fixture. */
export const arrangementOwnerReference = {
  canonicalId: 'owner-issued',
  uri: 'pops:contacts/contact/owner-issued',
};

/** Controllable owner receipts for the real bundled chooser and upload views. */
export interface ArrangementOwners {
  contactCreates: unknown[];
  uploadStarted: Promise<void>;
  acceptUpload: () => void;
  completeTask: () => void;
  uploadCount: () => number;
  taskReads: string[];
  associations: unknown[];
}

/** Stub only published owner REST surfaces; all chooser and document controls remain real. */
export async function stubArrangementOwners(page: Page): Promise<ArrangementOwners> {
  const contactCreates: unknown[] = [];
  await page.route(/\/contacts-api\/entity-types$/, (route) =>
    json(route, 200, { types: ['person', 'company'], defaultType: 'company' })
  );
  await page.route(/\/contacts-api\/entities(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      const body: unknown = route.request().postDataJSON();
      contactCreates.push(body);
      expect(body).toEqual({ name: 'New driver', type: 'company' });
      await json(route, 503, { error: 'Contact response unavailable' });
      return;
    }
    const search = new URL(route.request().url()).searchParams.get('search') ?? '';
    const data = 'Owner from Contacts'.toLowerCase().includes(search.toLowerCase())
      ? [ownerEntity()]
      : [];
    await json(route, 200, {
      data,
      pagination: { hasMore: false, limit: 20, offset: 0, total: data.length },
    });
  });
  await page.route(/\/contacts-api\/entities\/[^/]+\/reference$/, (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    return json(
      route,
      200,
      id === arrangementOwnerReference.canonicalId
        ? arrangementOwnerReference
        : { canonicalId: 'retained-unavailable', uri: 'pops:contacts/contact/retained-unavailable' }
    );
  });
  await page.route(/\/contacts-api\/entities\/[^/?]+$/, (route) =>
    new URL(route.request().url()).pathname.endsWith('/owner-issued')
      ? json(route, 200, { data: ownerEntity() })
      : json(route, 503, { error: 'Contacts unavailable' })
  );
  return { ...(await stubDocumentOwner(page)), contactCreates };
}
function ownerEntity() {
  return {
    id: arrangementOwnerReference.canonicalId,
    name: 'Owner from Contacts',
    type: 'company',
    aliases: [],
    defaultTags: [],
    lastEditedTime: '2030-01-01T00:00:00Z',
  };
}
async function stubDocumentOwner(page: Page): Promise<Omit<ArrangementOwners, 'contactCreates'>> {
  const associations: unknown[] = [];
  const taskReads: string[] = [];
  let uploads = 0;
  let completed = false;
  let notifyStarted: () => void = () => {};
  let acceptUpload: () => void = () => {};
  const uploadStarted = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  const acceptance = new Promise<void>((resolve) => {
    acceptUpload = resolve;
  });
  await page.route(/\/documents-api\/paperless\/status$/, (route) =>
    json(route, 200, {
      data: {
        configured: true,
        available: true,
        baseUrl: 'https://paperless.example',
        documentCount: 1,
        maxUploadBytes: 1000,
        allowedMimeTypes: ['application/pdf'],
      },
    })
  );
  await page.route(/\/documents-api\/paperless\/documents(?:\?.*)?$/, async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(new URL(route.request().url()).searchParams.get('fileName')).toBe('booking.pdf');
    expect(route.request().postDataBuffer()?.toString()).toBe('original booking');
    uploads += 1;
    notifyStarted();
    await acceptance;
    await json(route, 202, { data: { taskId: 'arrangement-upload-1' } });
  });
  await page.route(/\/documents-api\/paperless\/tasks\/arrangement-upload-1$/, (route) => {
    taskReads.push(route.request().url());
    return completed
      ? json(route, 200, { data: { state: 'done', documentId: 91, reason: null } })
      : json(route, 503, {
          code: 'documents.task.unavailable',
          message: 'Task lookup unavailable',
          retryable: true,
        });
  });
  await page.route(/\/documents-api\/paperless\/documents\/91$/, (route) =>
    json(route, 200, {
      data: {
        id: 91,
        title: 'Booking original',
        created: '2030-04-10',
        originalFileName: 'booking.pdf',
        thumbnailUrl: '',
      },
    })
  );
  await page.route(/\/trips-api\/trips\/7\/document-associations$/, async (route) => {
    if (route.request().method() === 'POST') {
      const body: unknown = route.request().postDataJSON();
      expect(body).toEqual({ documentId: 91, targetKind: 'stay', targetId: 14 });
      const association = {
        id: 81,
        tripId: 7,
        documentId: 91,
        targetKind: 'stay',
        targetId: 14,
        createdAt: '2030-04-10T00:00:00Z',
      };
      associations.push(association);
      await json(route, 201, association);
    } else await json(route, 200, { associations });
  });
  return {
    associations,
    taskReads,
    uploadStarted,
    acceptUpload,
    completeTask: () => {
      completed = true;
    },
    uploadCount: () => uploads,
  };
}
