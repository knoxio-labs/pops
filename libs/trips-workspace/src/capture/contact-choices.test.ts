import { expect, it, vi } from 'vitest';

import { CaptureBrowserSession } from './browser-session';
import { captureResult, captureSource, sourceCapture, sourceIdea } from './test-utils';

import type {
  ContactChooserIntent,
  ContactChooserMountProps,
  ContactChooserSelection,
  ContactsHostCapability,
} from '@pops/pillar-sdk';

import type { CapturePerformer } from './types';

function FakeChooser(_props: ContactChooserMountProps): null {
  return null;
}

function contactsHost() {
  const intents: ContactChooserIntent[] = [];
  const capability: ContactsHostCapability = {
    createIntent: () => {
      const intent = { Chooser: FakeChooser };
      intents.push(intent);
      return intent;
    },
  };
  return { capability, intents };
}

const selection: ContactChooserSelection = {
  name: 'Actual owner contact',
  reference: { canonicalId: 'owner-opaque-id', uri: 'pops:contacts/contact/owner-opaque-id' },
};

it('retains the same opaque owner intent across close and route remount while keeping trips separate', () => {
  const firstHost = contactsHost();
  const session = new CaptureBrowserSession(
    captureSource([sourceCapture()]),
    1,
    async (request) => captureResult(request),
    firstHost.capability
  );
  expect(session.contacts.available).toBe(true);
  session.contacts.open({ kind: 'capture', id: 1 });
  const first = session.contacts.snapshot();
  if (!first) throw new Error('Missing owner intent');
  session.contacts.changeOpen(false);
  session.contacts.open({ kind: 'capture', id: 1 }, true);
  expect(session.contacts.snapshot()?.chooser).toBe(first.chooser);
  expect(firstHost.intents).toHaveLength(1);

  const anotherTripHost = contactsHost();
  const anotherTrip = new CaptureBrowserSession(
    captureSource(),
    2,
    async (request) => captureResult(request),
    anotherTripHost.capability
  );
  expect(anotherTrip.contacts.snapshot()).toBeNull();
});

it('stores the canonical selection before a Trips link and retains it through failed association', async () => {
  const owner = contactsHost();
  const perform = vi.fn<CapturePerformer>().mockRejectedValue(new Error('Link response lost'));
  const session = new CaptureBrowserSession(
    captureSource([sourceCapture()]),
    1,
    perform,
    owner.capability
  );
  session.contacts.open({ kind: 'capture', id: 1 });
  const choice = session.contacts.snapshot();
  if (!choice) throw new Error('Missing owner intent');
  session.contacts.accept(choice.id, selection);
  expect(perform).not.toHaveBeenCalled();
  expect(session.records.organisation(1)?.target).toEqual({
    mode: 'existing',
    target: { kind: 'contact', reference: { uri: selection.reference.uri } },
  });
  expect(await session.records.organise(1)).toBe(false);
  expect(session.contacts.snapshot()?.selected).toEqual(selection);
  expect(await session.editor.retry()).toBe(false);
  expect(perform.mock.calls[1]?.[0]).toEqual(perform.mock.calls[0]?.[0]);
});

it('keeps the owner reference when its Trips source disappears before linking', () => {
  const owner = contactsHost();
  const perform = vi.fn<CapturePerformer>();
  const session = new CaptureBrowserSession(captureSource(), 1, perform, owner.capability);
  session.contacts.open({ kind: 'capture', id: 99 });
  const choice = session.contacts.snapshot();
  if (!choice) throw new Error('Missing owner intent');
  session.contacts.accept(choice.id, selection);
  expect(session.contacts.snapshot()).toMatchObject({ selected: selection, applied: false });
  session.editor.receive(captureSource([sourceCapture({ id: 99 })]), 0);
  session.contacts.applySelection();
  expect(session.records.organisation(99)?.target).toMatchObject({
    mode: 'existing',
    target: { kind: 'contact', reference: { uri: selection.reference.uri } },
  });
  expect(perform).not.toHaveBeenCalled();
});

it('retains prior unresolved Idea references and does not duplicate a delivered selection', async () => {
  const owner = contactsHost();
  const source = {
    ...captureSource(),
    ideas: [sourceIdea({ id: 7, contactLinks: [{ uri: 'pops:contacts/contact/unavailable' }] })],
  };
  const perform = vi.fn<CapturePerformer>().mockRejectedValue(new Error('Trips unavailable'));
  const session = new CaptureBrowserSession(source, 1, perform, owner.capability);
  session.contacts.open({ kind: 'idea-contact', id: 7 });
  const choice = session.contacts.snapshot();
  if (!choice) throw new Error('Missing owner intent');
  session.contacts.accept(choice.id, selection);
  await vi.waitFor(() => expect(perform).toHaveBeenCalledTimes(1));
  session.contacts.applySelection();
  expect(session.records.idea(7)?.input.contactLinks).toEqual([
    { uri: 'pops:contacts/contact/unavailable' },
    { uri: selection.reference.uri },
  ]);
});

it('does not invent a local owner chooser when the host has no capability', () => {
  const session = new CaptureBrowserSession(captureSource(), 1, async (request) =>
    captureResult(request)
  );
  expect(session.contacts.available).toBe(false);
  session.contacts.open({ kind: 'capture', id: 1 });
  expect(session.contacts.snapshot()).toBeNull();
  expect(session.contacts.available).toBe(false);
});

it('fences a closed or replaced chooser callback without applying it to another source', () => {
  const owner = contactsHost();
  const session = new CaptureBrowserSession(
    captureSource([sourceCapture(), sourceCapture({ id: 2 })]),
    1,
    async (request) => captureResult(request),
    owner.capability
  );
  session.contacts.open({ kind: 'capture', id: 1 });
  const first = session.contacts.snapshot();
  if (!first) throw new Error('Missing intent');
  session.contacts.changeOpen(false);
  session.contacts.accept(first.id, selection);
  expect(session.records.organisation(1)).toBeUndefined();
  expect(session.contacts.snapshot()?.selected).toBeNull();
  session.contacts.open({ kind: 'capture', id: 2 });
  session.contacts.accept(first.id, selection);
  expect(session.records.organisation(1)).toBeUndefined();
  expect(session.records.organisation(2)).toBeUndefined();
  session.contacts.open({ kind: 'capture', id: 1 });
  expect(session.contacts.snapshot()?.chooser).toBe(first.chooser);
});
