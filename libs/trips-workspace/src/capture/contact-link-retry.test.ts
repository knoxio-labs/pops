import { expect, it, vi } from 'vitest';

import { CaptureBrowserSession } from './browser-session';
import { captureResult, captureSource, deferred, sourceCapture, sourceIdea } from './test-utils';

import type { ContactsHostCapability } from '@pops/pillar-sdk';

import type { CaptureRequest, CaptureResult, CaptureSource } from './types';

const selection = {
  name: 'Actual owner',
  reference: { canonicalId: 'opaque', uri: 'pops:contacts/contact/opaque' },
};
const createIntent = vi.fn(() => ({ Chooser: () => null }));
const host: ContactsHostCapability = { createIntent };

function applied(source: CaptureSource, request: CaptureRequest): CaptureResult {
  const command = request.command;
  if (command.kind === 'idea.update') {
    const idea = source.ideas.find((row) => row.id === command.id);
    if (!idea) throw new Error('Missing Idea');
    return captureResult(request, {
      ...source,
      ideas: [{ ...idea, ...command.input, revision: idea.revision + 1 }],
    });
  }
  return captureResult(request, source);
}

it.each(['idea-contact', 'recommendation'] as const)(
  'retains a retryable %s link while another operation is pending without appending again',
  async (kind) => {
    createIntent.mockClear();
    const source = { ...captureSource([sourceCapture()]), ideas: [sourceIdea({ id: 7 })] };
    const gate = deferred<CaptureResult>();
    const requests: CaptureRequest[] = [];
    const session = new CaptureBrowserSession(
      source,
      1,
      async (request) => {
        requests.push(request);
        return requests.length === 1 ? gate.promise : applied(source, request);
      },
      host
    );
    const pending = session.editor.commit(
      { kind: 'capture.update', id: 1, expectedRevision: 1, input: { notes: 'Other edit' } },
      'Other edit'
    );
    session.contacts.open({ kind, id: 7 });
    const choice = session.contacts.snapshot();
    if (!choice) throw new Error('Missing intent');
    session.contacts.accept(choice.id, selection);
    await Promise.resolve();
    expect(session.contacts.snapshot()?.applied).toBe(false);
    await session.contacts.applySelection();
    expect(requests).toHaveLength(1);
    const request = requests[0];
    if (!request) throw new Error('Missing operation');
    gate.resolve(applied(source, request));
    await pending;
    await session.contacts.applySelection();
    expect(session.contacts.snapshot()?.applied).toBe(true);
    expect(requests.map((item) => item.command.kind)).toEqual(['capture.update', 'idea.update']);
    expect(session.editor.getState().source.ideas[0]).toMatchObject(
      kind === 'idea-contact'
        ? { contactLinks: [{ uri: selection.reference.uri }] }
        : { recommendations: [{ contact: { uri: selection.reference.uri }, note: '' }] }
    );
    await session.contacts.applySelection();
    expect(requests).toHaveLength(2);
    expect(createIntent).toHaveBeenCalledTimes(1);
    expect(session.contacts.snapshot()?.chooser).toBe(choice.chooser);
  }
);

it('retains a canonical selection after an ambiguous earlier operation and retries only its link after resolution', async () => {
  const source = { ...captureSource([sourceCapture()]), ideas: [sourceIdea({ id: 7 })] };
  const requests: CaptureRequest[] = [];
  const session = new CaptureBrowserSession(
    source,
    1,
    async (request) => {
      requests.push(request);
      if (requests.length === 1) throw new Error('Lost response');
      return applied(source, request);
    },
    host
  );
  await session.editor.commit(
    { kind: 'capture.update', id: 1, expectedRevision: 1, input: { notes: 'Other edit' } },
    'Other edit'
  );
  expect(session.editor.getState().busy).toBe(false);
  session.contacts.open({ kind: 'idea-contact', id: 7 });
  const choice = session.contacts.snapshot();
  if (!choice) throw new Error('Missing intent');
  session.contacts.accept(choice.id, selection);
  await Promise.resolve();
  expect(session.contacts.snapshot()).toMatchObject({ selected: selection, applied: false });
  expect(requests).toHaveLength(1);
  await session.editor.retry();
  expect(requests[1]).toEqual(requests[0]);
  await session.contacts.applySelection();
  expect(session.contacts.snapshot()?.applied).toBe(true);
  expect(session.editor.getState().source.ideas[0]?.contactLinks).toEqual([
    { uri: selection.reference.uri },
  ]);
  expect(requests.filter((item) => item.command.kind === 'idea.update')).toHaveLength(1);
});

it('confirms a lost Idea-link response through its exact request replay without appending or creating again', async () => {
  createIntent.mockClear();
  const source = { ...captureSource(), ideas: [sourceIdea({ id: 7 })] };
  const requests: CaptureRequest[] = [];
  const session = new CaptureBrowserSession(
    source,
    1,
    async (request) => {
      requests.push(request);
      if (requests.length === 1) throw new Error('Lost link response');
      return applied(source, request);
    },
    host
  );
  session.contacts.open({ kind: 'recommendation', id: 7 });
  const choice = session.contacts.snapshot();
  if (!choice) throw new Error('Missing intent');
  session.contacts.accept(choice.id, selection);
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  await vi.waitFor(() => {
    expect(session.editor.getState().busy).toBe(false);
    expect(session.editor.getState().failure?.canRetry).toBe(true);
  });
  expect(session.contacts.snapshot()?.applied).toBe(false);
  await session.editor.retry();
  expect(requests[1]).toEqual(requests[0]);
  expect(session.contacts.snapshot()?.applied).toBe(true);
  await session.contacts.applySelection();
  expect(requests).toHaveLength(2);
  expect(createIntent).toHaveBeenCalledTimes(1);
  expect(session.editor.getState().source.ideas[0]?.recommendations).toEqual([
    { contact: { uri: selection.reference.uri }, note: '' },
  ]);
});

it('never borrows another Idea confirmation with identical reference fields and revision', async () => {
  const source = { ...captureSource(), ideas: [sourceIdea({ id: 7 }), sourceIdea({ id: 8 })] };
  const gate = deferred<CaptureResult>();
  let request: CaptureRequest | undefined;
  const session = new CaptureBrowserSession(
    source,
    1,
    async (value) => {
      request = value;
      return gate.promise;
    },
    host
  );
  const pending = session.editor.commit(
    {
      kind: 'idea.update',
      id: 8,
      expectedRevision: 1,
      input: { contactLinks: [{ uri: selection.reference.uri }] },
    },
    'Other Idea'
  );
  session.contacts.open({ kind: 'idea-contact', id: 7 });
  const choice = session.contacts.snapshot();
  if (!choice || !request) throw new Error('Missing operation');
  session.contacts.accept(choice.id, selection);
  await Promise.resolve();
  gate.resolve(applied(source, request));
  await pending;
  expect(session.contacts.snapshot()?.applied).toBe(false);
  expect(session.contacts.snapshot()?.selected).toEqual(selection);
  expect(session.records.idea(7)?.input.contactLinks).toEqual([{ uri: selection.reference.uri }]);
});
