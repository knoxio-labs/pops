import { expect } from '@playwright/test';

import { json } from './pillar-rest';
import { stubDurableUploadOwner } from './trips-durable-uploads';

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
  uploadReads: string[];
  operationIds: string[];
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
  const uploadReads: string[] = [];
  const operationIds: string[] = [];
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
  await stubDurableUploadOwner(page, {
    admit: (input) => {
      expect(input.fileName).toBe('booking.pdf');
      operationIds.push(input.operationId);
      return 'arrangement-upload-1';
    },
    content: (_input, bytes) => {
      expect(bytes.toString()).toBe('original booking');
    },
    dispatch: async () => {
      uploads += 1;
      notifyStarted();
      await acceptance;
    },
    read: (_input, taskId, url) => {
      expect(taskId).toBe('arrangement-upload-1');
      uploadReads.push(url);
      return completed ? { state: 'done', documentId: 91 } : { state: 'unavailable' };
    },
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
    uploadReads,
    operationIds,
    uploadStarted,
    acceptUpload,
    completeTask: () => {
      completed = true;
    },
    uploadCount: () => uploads,
  };
}
