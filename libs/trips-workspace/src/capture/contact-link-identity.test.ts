import { expect, it, vi } from 'vitest';

import { ApiError } from '@pops/pillar-sdk/client';

import { CaptureBrowserSession } from './browser-session';
import { captureResult, captureSource, sourceCapture, sourceIdea } from './test-utils';

import type { ContactChooserSelection } from '@pops/pillar-sdk';

import type { CaptureRequest } from './types';

const first: ContactChooserSelection = {
  name: 'First owner',
  reference: { canonicalId: 'first', uri: 'pops:contacts/contact/first' },
};
const second: ContactChooserSelection = {
  name: 'Second owner',
  reference: { canonicalId: 'second', uri: 'pops:contacts/contact/second' },
};

function setup(firstError: Error = new Error('Lost response')) {
  const source = { ...captureSource([sourceCapture()]), ideas: [sourceIdea({ id: 7 })] };
  const requests: CaptureRequest[] = [];
  const createIntent = vi.fn(() => ({ Chooser: () => null }));
  const session = new CaptureBrowserSession(
    source,
    1,
    async (request) => {
      requests.push(request);
      if (requests.length === 1) throw firstError;
      const command = request.command;
      return captureResult(request, {
        ...source,
        ideas: source.ideas.map((idea) =>
          command.kind === 'idea.update' && idea.id === command.id
            ? { ...idea, ...command.input, revision: idea.revision + 1 }
            : idea
        ),
      });
    },
    { createIntent }
  );
  return { source, requests, session, createIntent };
}

async function blockWithOtherOperation(session: CaptureBrowserSession) {
  await session.editor.commit(
    { kind: 'capture.update', id: 1, expectedRevision: 1, input: { notes: 'Other edit' } },
    'Other edit'
  );
}

it.each(['idea-contact', 'recommendation'] as const)(
  'replaces an unsent %s selection with a new intent and saves only the new canonical reference',
  async (kind) => {
    const { session, requests, createIntent } = setup();
    await blockWithOtherOperation(session);
    session.contacts.open({ kind, id: 7 });
    const original = session.contacts.snapshot();
    if (!original) throw new Error('Missing intent');
    session.contacts.accept(original.id, first);
    await Promise.resolve();
    session.contacts.open({ kind, id: 7 }, true);
    const replacement = session.contacts.snapshot();
    if (!replacement) throw new Error('Missing successor');
    expect(replacement.id).not.toBe(original.id);
    session.contacts.accept(replacement.id, second);
    session.contacts.accept(original.id, first);
    await Promise.resolve();
    await session.editor.retry();
    await session.contacts.applySelection();
    expect(session.contacts.snapshot()).toMatchObject({ selected: second, applied: true });
    expect(session.editor.getState().source.ideas[0]).toMatchObject(
      kind === 'idea-contact'
        ? { contactLinks: [{ uri: second.reference.uri }] }
        : { recommendations: [{ contact: { uri: second.reference.uri }, note: '' }] }
    );
    expect(session.contacts.hasKnownReference(first.reference.uri)).toBe(true);
    expect(requests.filter((request) => request.command.kind === 'idea.update')).toHaveLength(1);
    expect(createIntent).toHaveBeenCalledTimes(2);
  }
);

it.each(['idea-contact', 'recommendation'] as const)(
  'allows explicit replacement of a definitely rejected %s while preserving independent equal links and other edits',
  async (kind) => {
    const { session, source } = setup(
      new ApiError({
        code: 'trips.capture.conflict',
        kind: 'client',
        status: 409,
        message: 'Conflict',
        retryable: false,
      })
    );
    const idea = source.ideas[0];
    if (!idea) throw new Error('Missing Idea');
    session.records.editIdea(idea, {
      notes: 'Keep this current edit',
      ...(kind === 'idea-contact'
        ? { contactLinks: [{ uri: first.reference.uri }] }
        : { recommendations: [{ contact: { uri: first.reference.uri }, note: 'Independent' }] }),
    });
    session.contacts.open({ kind, id: 7 });
    const choice = session.contacts.snapshot();
    if (!choice) throw new Error('Missing intent');
    session.contacts.accept(choice.id, first);
    await vi.waitFor(() => expect(session.editor.getState().failure).not.toBeNull());
    session.contacts.chooseAnother();
    const replacement = session.contacts.snapshot();
    if (!replacement) throw new Error('Missing successor');
    expect(replacement.id).not.toBe(choice.id);
    session.contacts.accept(replacement.id, second);
    await vi.waitFor(() => expect(session.contacts.snapshot()?.applied).toBe(true));
    expect(session.editor.getState().source.ideas[0]).toMatchObject({
      notes: 'Keep this current edit',
      ...(kind === 'idea-contact'
        ? { contactLinks: [{ uri: first.reference.uri }, { uri: second.reference.uri }] }
        : {
            recommendations: [
              { contact: { uri: first.reference.uri }, note: 'Independent' },
              { contact: { uri: second.reference.uri }, note: '' },
            ],
          }),
    });
    expect(session.contacts.hasKnownReference(first.reference.uri)).toBe(true);
  }
);

it('returns a detached pending request so intent guards cannot mutate the exact retry payload', async () => {
  const { session, requests } = setup();
  await blockWithOtherOperation(session);
  const pending = session.editor.getPendingRequest();
  if (pending?.command.kind !== 'capture.update') throw new Error('Missing pending command');
  pending.command.input.notes = 'Attempted mutation';
  pending.operationId = crypto.randomUUID();
  await session.editor.retry();
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[1]?.command).toMatchObject({ input: { notes: 'Other edit' } });
  expect(session.editor.getPendingRequest()).toBeNull();
});

it.each(['idea-contact', 'recommendation'] as const)(
  'does not acknowledge a discarded %s link from an unrelated draft; explicit restore preserves only current edits',
  async (kind) => {
    const { session, requests, source } = setup();
    await blockWithOtherOperation(session);
    const idea = source.ideas[0];
    if (!idea) throw new Error('Missing Idea');
    session.records.editIdea(idea, { notes: 'Discard this earlier edit' });
    session.contacts.open({ kind, id: 7 });
    const choice = session.contacts.snapshot();
    if (!choice) throw new Error('Missing intent');
    session.contacts.accept(choice.id, first);
    await Promise.resolve();
    session.records.discard('idea', 7);
    await session.editor.retry();
    session.records.editIdea(idea, { name: 'Current edit' });
    await session.contacts.applySelection();
    expect(requests).toHaveLength(2);
    expect(session.contacts.snapshot()?.applied).toBe(false);
    expect(session.contacts.snapshot()?.linkError).toContain('Restore');
    session.contacts.restoreSelection();
    await session.contacts.applySelection();
    expect(session.contacts.snapshot()?.applied).toBe(true);
    const command = requests[2]?.command;
    expect(command).toMatchObject({ kind: 'idea.update', input: { name: 'Current edit' } });
    expect(command?.kind === 'idea.update' && command.input.notes).toBeUndefined();
    expect(session.editor.getState().source.ideas[0]).toMatchObject(
      kind === 'idea-contact'
        ? { contactLinks: [{ uri: first.reference.uri }] }
        : { recommendations: [{ contact: { uri: first.reference.uri }, note: '' }] }
    );
  }
);

it.each(['idea-contact', 'recommendation'] as const)(
  'keeps an unknown %s command immutable and fences a different selection until exact replay resolves it',
  async (kind) => {
    const { session, requests, createIntent } = setup();
    session.contacts.open({ kind, id: 7 });
    const choice = session.contacts.snapshot();
    if (!choice) throw new Error('Missing intent');
    session.contacts.accept(choice.id, first);
    await vi.waitFor(() => expect(session.editor.getState().failure).not.toBeNull());
    session.records.discard('idea', 7);
    session.contacts.open({ kind, id: 7 }, true);
    session.contacts.accept(choice.id, second);
    session.contacts.restoreSelection();
    expect(session.contacts.snapshot()).toMatchObject({
      id: choice.id,
      selected: first,
      applied: false,
      open: false,
    });
    expect(session.records.idea(7)).toBeUndefined();
    expect(createIntent).toHaveBeenCalledTimes(1);
    session.contacts.open({ kind, id: 8 }, true);
    expect(createIntent).toHaveBeenCalledTimes(2);
    session.contacts.open({ kind, id: 7 });
    await session.editor.retry();
    expect(requests[1]).toEqual(requests[0]);
    expect(session.contacts.snapshot()).toMatchObject({ selected: first, applied: true });
    session.contacts.open({ kind, id: 7 }, true);
    expect(session.contacts.snapshot()?.id).not.toBe(choice.id);
  }
);
