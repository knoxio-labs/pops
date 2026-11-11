import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { CaptureBrowserSession } from './browser-session';
import { CaptureContactChooser } from './CaptureContactChooser';
import { captureResult, captureSource, deferred, sourceCapture, sourceIdea } from './test-utils';

import type { ContactsHostCapability } from '@pops/pillar-sdk';

import type { CaptureRequest, CaptureResult } from './types';

afterEach(cleanup);

it('exposes the retained canonical link retry after a blocked save and never creates another owner intent', async () => {
  const createIntent = vi.fn(() => ({ Chooser: () => null }));
  const host: ContactsHostCapability = { createIntent };
  const idea = sourceIdea({ id: 7 });
  const source = { ...captureSource([sourceCapture()]), ideas: [idea] };
  const gate = deferred<CaptureResult>();
  const requests: CaptureRequest[] = [];
  const session = new CaptureBrowserSession(
    source,
    1,
    async (request) => {
      requests.push(request);
      if (requests.length === 1) return gate.promise;
      if (request.command.kind !== 'idea.update') throw new Error('Unexpected request');
      return captureResult(request, {
        ...source,
        ideas: [{ ...idea, ...request.command.input, revision: 2 }],
      });
    },
    host
  );
  const pending = session.editor.commit(
    { kind: 'capture.update', id: 1, expectedRevision: 1, input: { notes: 'Another edit' } },
    'Another edit'
  );
  session.contacts.open({ kind: 'idea-contact', id: 7 });
  const choice = session.contacts.snapshot();
  if (!choice) throw new Error('Missing intent');
  render(<CaptureContactChooser session={session} />);
  session.contacts.accept(choice.id, {
    name: 'Owner contact',
    reference: { canonicalId: 'opaque', uri: 'pops:contacts/contact/opaque' },
  });
  await screen.findByText(
    'The contact is retained. Confirm or retry the Trips operation, then retry linking.'
  );
  expect(screen.getByText('pops:contacts/contact/opaque')).toBeVisible();
  const retry = screen.getByRole('button', { name: 'Retry linking selected contact' });
  const user = userEvent.setup();
  await user.click(retry);
  expect(requests).toHaveLength(1);
  session.records.discard('idea', 7);
  await user.click(retry);
  expect(
    await screen.findByText(
      'The link draft was discarded or changed. Restore the selected link before retrying.'
    )
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Restore selected link to draft' }));
  expect(session.records.idea(7)?.input.contactLinks).toEqual([
    { uri: 'pops:contacts/contact/opaque' },
  ]);
  const request = requests[0];
  if (!request) throw new Error('Missing request');
  gate.resolve(captureResult(request, source));
  await pending;
  await user.click(retry);
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Retry linking selected contact' })
    ).not.toBeInTheDocument()
  );
  expect(session.editor.getState().source.ideas[0]?.contactLinks).toEqual([
    { uri: 'pops:contacts/contact/opaque' },
  ]);
  expect(requests).toHaveLength(2);
  expect(createIntent).toHaveBeenCalledTimes(1);
});
