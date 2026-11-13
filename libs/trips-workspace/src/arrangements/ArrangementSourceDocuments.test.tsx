import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createClient as createDocumentsClient } from '../documents-api/client';
import { readableUploadFile, uploadWebCrypto } from '../documents/durable-upload-wire-test-utils';
import { createClient } from '../trips-api/client';
import {
  arrangementDocumentsHarness,
  openArrangementDocuments,
  selectArrangementFiles,
} from './arrangement-document-test-utils';

import type { ArrangementsWorkspaceProps } from './types';

type Harness = ReturnType<typeof arrangementDocumentsHarness>;
const owners: Harness[] = [];
beforeEach(() => vi.stubGlobal('crypto', uploadWebCrypto));
afterEach(() => {
  cleanup();
  for (const owner of owners) owner.cache.clear();
  owners.length = 0;
  vi.unstubAllGlobals();
});
function setup(): Harness {
  const owner = arrangementDocumentsHarness();
  owners.push(owner);
  return owner;
}

it.each(['stay', 'event', 'journey'] as const)(
  'opens one canonical %s document panel through the actual Arrangements parent',
  async (kind) => {
    const owner = setup();
    const dialog = await openArrangementDocuments(kind);
    expect(within(dialog).getAllByRole('region', { name: 'Add files' })).toHaveLength(1);
    expect(within(dialog).getAllByRole('region', { name: 'Source documents' })).toHaveLength(1);
    expect(
      owner.documents.requests.some((request) => request.url.endsWith('/paperless/status'))
    ).toBe(true);
    expect(owner.documents.dispatches).toHaveLength(0);
    const target = { kind, id: { stay: 13, event: 19, journey: 20 }[kind] };
    const file = readableUploadFile('source document', `${kind}.pdf`);
    await selectArrangementFiles([file]);
    expect(owner.session(target).read()[0]?.file).toBe(file);
  }
);

async function beginUploads(owner: Harness): Promise<File[]> {
  const files = [
    readableUploadFile('unknown original', 'unknown.pdf'),
    readableUploadFile('accepted original', 'accepted.pdf'),
  ];
  await selectArrangementFiles(files);
  const buttons = screen.getAllByRole('button', { name: 'Send to Documents' });
  expect(buttons).toHaveLength(2);
  act(() => {
    for (const button of buttons) {
      button.click();
      button.click();
    }
  });
  await waitFor(() => expect(owner.documents.dispatches).toHaveLength(2));
  expect(owner.documents.createCount()).toBe(2);
  expect(owner.documents.putCount()).toBe(2);
  expect(owner.session().read()[0]?.file).toBe(files[0]);
  expect(owner.session().read()[1]?.file).toBe(files[1]);
  return files;
}

async function receiveUploads(owner: Harness): Promise<void> {
  const [unknownIntent, acceptedIntent] = owner.session().read();
  const unknown = owner.documents.dispatches.find(
    (dispatch) => dispatch.input.operationId === unknownIntent?.upload.id
  );
  const accepted = owner.documents.dispatches.find(
    (dispatch) => dispatch.input.operationId === acceptedIntent?.upload.id
  );
  if (!unknown || !accepted) throw new Error('Actual owner requests were not captured');
  await act(async () => {
    unknown.fail(new Error('Upload interrupted'));
    accepted.accept('accepted-original-91');
  });
  await waitFor(() => {
    expect(owner.session().read()[0]?.upload.uncertain).toBe(true);
    expect(owner.session().read()[1]?.upload.taskId).toBe('accepted-original-91');
  });
}

async function closeSource(): Promise<void> {
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

it('retains exact Files and late owner outcomes through source A to B to A, keyed parent unmount and query eviction', async () => {
  const owner = setup();
  await openArrangementDocuments('stay');
  const files = await beginUploads(owner);
  const session = owner.session();
  await closeSource();
  const other = await openArrangementDocuments('event');
  expect(within(other).queryByRole('article', { name: /^Selected file/ })).not.toBeInTheDocument();
  await receiveUploads(owner);
  expect(owner.session({ kind: 'event', id: 19 }).read()).toEqual([]);
  expect(owner.trips.links).toEqual([]);
  await closeSource();
  act(() => owner.cache.clear());
  owner.view.rerender(owner.content(owner.identity, 1));
  await openArrangementDocuments('stay');
  expect(await screen.findByRole('button', { name: 'Link file' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Check upload status' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Send to Documents' })).toBeDisabled();
  expect(owner.session()).toBe(session);
  expect(session.read()[0]?.file).toBe(files[0]);
  expect(session.read()[1]?.file).toBe(files[1]);
  expect(session.read()[1]?.upload.taskReceipt?.result.documentId).toBe(91);
  await userEvent.click(screen.getByRole('button', { name: 'Link file' }));
  await waitFor(() =>
    expect(owner.trips.links).toEqual([
      {
        url: 'http://arrangements.test/trips/7/document-associations',
        body: { documentId: 91, targetKind: 'stay', targetId: 13 },
      },
    ])
  );
  expect(owner.documents.dispatchCount()).toBe(2);
});

type OwnerChange = 'trips-client' | 'documents-client' | 'trips-origin' | 'documents-origin';
function replaceOwner(owner: Harness, change: OwnerChange): ArrangementsWorkspaceProps {
  if (change === 'trips-client')
    return { ...owner.identity, client: createClient(owner.trips.client.getConfig()) };
  if (change === 'documents-client')
    return {
      ...owner.identity,
      documentsClient: createDocumentsClient(owner.documents.client.getConfig()),
    };
  if (change === 'trips-origin')
    owner.trips.client.setConfig({ baseUrl: 'http://other-trips.test' });
  else owner.documents.client.setConfig({ baseUrl: 'http://other-documents.test' });
  return owner.identity;
}

it.each<OwnerChange>(['trips-client', 'documents-client', 'trips-origin', 'documents-origin'])(
  'isolates real parent upload evidence at a changed %s and restores only the original owner',
  async (change) => {
    const owner = setup();
    await openArrangementDocuments('stay');
    const files = await beginUploads(owner);
    await receiveUploads(owner);
    await screen.findByRole('button', { name: 'Link file' });
    const session = owner.session();
    const upload = session.read()[1]?.upload;
    const receipt = upload?.taskReceipt;
    expect(receipt?.result.documentId).toBe(91);
    await closeSource();
    const replacement = replaceOwner(owner, change);
    owner.view.rerender(owner.content(replacement));
    const other = await openArrangementDocuments('stay', false);
    const replacementSession = owner.session({ kind: 'stay', id: 13 }, replacement);
    if (change === 'trips-client' || change === 'documents-client') {
      expect(replacementSession).not.toBe(session);
      expect(replacementSession.read()).toHaveLength(1);
      expect(replacementSession.read()[0]?.file).toBeNull();
      expect(replacementSession.read()[0]?.upload.id).toBe(session.read()[0]?.upload.id);
      expect(
        within(other).getByRole('article', { name: 'Selected file unknown.pdf' })
      ).toBeVisible();
    } else {
      expect(
        within(other).queryByRole('article', { name: /^Selected file/ })
      ).not.toBeInTheDocument();
      expect(replacementSession.read()).toEqual([]);
    }
    expect(owner.documents.createCount()).toBe(2);
    expect(owner.documents.putCount()).toBe(2);
    expect(owner.documents.dispatchCount()).toBe(2);
    expect(owner.trips.links).toEqual([]);
    await closeSource();
    owner.trips.client.setConfig({ baseUrl: 'http://arrangements.test' });
    owner.documents.client.setConfig({ baseUrl: 'http://arrangements.test/documents-api' });
    owner.view.rerender(owner.content());
    await openArrangementDocuments('stay');
    expect(await screen.findByRole('button', { name: 'Link file' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check upload status' })).toBeVisible();
    expect(owner.session()).toBe(session);
    expect(session.read()[0]?.file).toBe(files[0]);
    expect(session.read()[1]?.file).toBe(files[1]);
    expect(session.read()[1]?.upload.id).toBe(upload?.id);
    expect(session.read()[1]?.upload.taskReceipt).toEqual(receipt);
    expect(owner.documents.dispatchCount()).toBe(2);
  }
);
