import { expect, it, vi } from 'vitest';

import { CaptureBrowserSession } from './browser-session';
import { captureResult, captureSource, sourceCapture, sourceIdea } from './test-utils';

import type { ContactChooserProps } from '@pops/app-contacts';

import type { CapturePerformer } from './types';

const entity: Parameters<ContactChooserProps['onSelect']>[0] = {
  id: 'owner-opaque-id',
  name: 'Actual owner contact',
  type: 'person',
  aliases: [],
  defaultTags: [],
  lastEditedTime: '2026-11-10T00:00:00Z',
};
const reference = { canonicalId: entity.id, uri: `pops:contacts/contact/${entity.id}` };

it('retains the same unresolved owner intent across close and route remount while keeping trips separate', () => {
  const session = new CaptureBrowserSession(captureSource([sourceCapture()]), 1, async (request) =>
    captureResult(request)
  );
  session.contacts.open({ kind: 'capture', id: 1 });
  const first = session.contacts.snapshot();
  if (!first) throw new Error('Missing owner intent');
  first.session.setName('Retained draft');
  first.session.setType('person');
  session.contacts.changeOpen(false);
  session.contacts.open({ kind: 'capture', id: 1 }, true);
  expect(session.contacts.snapshot()?.session).toBe(first.session);
  expect(session.contacts.snapshot()?.session.snapshot()).toMatchObject({
    name: 'Retained draft',
    selectedType: 'person',
  });
  const anotherTrip = new CaptureBrowserSession(captureSource(), 2, async (request) =>
    captureResult(request)
  );
  expect(anotherTrip.contacts.snapshot()).toBeNull();
});

it('stores the canonical selection before a Trips link and retains it through failed association', async () => {
  const perform = vi.fn<CapturePerformer>().mockRejectedValue(new Error('Link response lost'));
  const session = new CaptureBrowserSession(captureSource([sourceCapture()]), 1, perform);
  session.contacts.open({ kind: 'capture', id: 1 });
  const choice = session.contacts.snapshot();
  if (!choice) throw new Error('Missing owner intent');
  session.contacts.accept(choice.id, entity, reference);
  expect(perform).not.toHaveBeenCalled();
  expect(session.records.organisation(1)?.target).toEqual({
    mode: 'existing',
    target: { kind: 'contact', reference: { uri: reference.uri } },
  });
  expect(await session.records.organise(1)).toBe(false);
  expect(session.contacts.snapshot()?.selected?.reference).toEqual(reference);
  expect(await session.editor.retry()).toBe(false);
  expect(perform.mock.calls[1]?.[0]).toEqual(perform.mock.calls[0]?.[0]);
});

it('keeps a created owner reference when the Trips source disappears and retries only its association draft', () => {
  const perform = vi.fn<CapturePerformer>();
  const session = new CaptureBrowserSession(captureSource(), 1, perform);
  session.contacts.open({ kind: 'capture', id: 99 });
  const choice = session.contacts.snapshot();
  if (!choice) throw new Error('Missing owner intent');
  session.contacts.accept(choice.id, entity, reference);
  expect(session.contacts.snapshot()).toMatchObject({ selected: { reference }, applied: false });
  session.editor.receive(captureSource([sourceCapture({ id: 99 })]), 0);
  session.contacts.applySelection();
  expect(session.records.organisation(99)?.target).toMatchObject({
    mode: 'existing',
    target: { kind: 'contact', reference: { uri: reference.uri } },
  });
  expect(perform).not.toHaveBeenCalled();
});

it('retains prior unresolved Idea references and never appends the same delivered selection twice', async () => {
  const source = {
    ...captureSource(),
    ideas: [sourceIdea({ id: 7, contactLinks: [{ uri: 'pops:contacts/contact/unavailable' }] })],
  };
  const perform = vi.fn<CapturePerformer>().mockRejectedValue(new Error('Trips unavailable'));
  const session = new CaptureBrowserSession(source, 1, perform);
  session.contacts.open({ kind: 'idea-contact', id: 7 });
  const choice = session.contacts.snapshot();
  if (!choice) throw new Error('Missing owner intent');
  session.contacts.accept(choice.id, entity, reference);
  await vi.waitFor(() => expect(perform).toHaveBeenCalledTimes(1));
  session.contacts.applySelection();
  expect(session.records.idea(7)?.input.contactLinks).toEqual([
    { uri: 'pops:contacts/contact/unavailable' },
    { uri: reference.uri },
  ]);
});
