import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { CaptureBrowserSession } from './browser-session';
import { CaptureInbox } from './CaptureInbox';
import { captureSource, deferred, sourceCapture } from './test-utils';

import type { ContactReferenceReadResult } from '@pops/pillar-sdk';

afterEach(cleanup);

it('reads retained owner references even when the selected Inbox filter hides their rows, without acknowledging a source write', async () => {
  const capture = sourceCapture();
  const source = captureSource([capture]);
  source.associations.push({
    id: 1,
    tripId: 1,
    captureId: capture.id,
    target: { kind: 'contact', reference: { uri: 'pops:contacts/contact/old-id' } },
    provenance: 'existing',
    sourceRevision: 1,
    revision: 1,
    removedAt: null,
    createdAt: capture.createdAt,
    updatedAt: capture.updatedAt,
  });
  const gate = deferred<ContactReferenceReadResult>();
  const read = vi.fn(async () => gate.promise);
  const perform = vi.fn();
  const session = new CaptureBrowserSession(source, 1, perform, {
    createIntent: () => ({ Chooser: () => null }),
    readContactReference: read,
  });
  render(<CaptureInbox session={session} />);
  await userEvent
    .setup()
    .selectOptions(screen.getByRole('combobox', { name: 'Inbox filter' }), 'organised');
  expect(screen.queryByRole('article', { name: 'Capture 1' })).not.toBeInTheDocument();
  expect(read).toHaveBeenCalledExactlyOnceWith('pops:contacts/contact/old-id');
  gate.resolve({
    status: 'available',
    name: 'Actual owner',
    reference: { canonicalId: 'canonical', uri: 'pops:contacts/contact/canonical' },
    href: '/contacts/canonical',
  });
  expect(await screen.findByRole('article', { name: 'Capture 1' })).toBeVisible();
  expect(screen.getByText('organised', { exact: true })).toBeVisible();
  expect(source.associations[0]?.target).toEqual({
    kind: 'contact',
    reference: { uri: 'pops:contacts/contact/old-id' },
  });
  expect(perform).not.toHaveBeenCalled();
  expect(session.editor.getState().confirmation).toBeNull();
  expect(session.contacts.snapshot()).toBeNull();
});
